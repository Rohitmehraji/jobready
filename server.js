const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  dest: path.join(__dirname, 'uploads'),
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

const SKILL_KEYWORDS = [
  'javascript', 'typescript', 'react', 'next.js', 'node', 'express', 'python', 'java', 'c++',
  'sql', 'mongodb', 'postgresql', 'aws', 'azure', 'docker', 'kubernetes', 'git', 'rest',
  'graphql', 'machine learning', 'nlp', 'data analysis', 'power bi', 'tableau', 'figma',
  'html', 'css', 'tailwind', 'leadership', 'communication', 'agile', 'scrum', 'ci/cd'
];

const EXPERIENCE_PATTERNS = [
  /(\d+)\+?\s*years?/gi,
  /experience\s*[:\-]?\s*(\d+)\+?\s*years?/gi,
  /worked\s*for\s*(\d+)\+?\s*years?/gi,
];

async function extractTextFromResume(filePath, mimetype, originalName) {
  const ext = path.extname(originalName).toLowerCase();

  if (mimetype === 'application/pdf' || ext === '.pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }

  if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === '.docx'
  ) {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (mimetype === 'text/plain' || ext === '.txt') {
    return fs.readFileSync(filePath, 'utf8');
  }

  throw new Error('Unsupported resume format. Please upload PDF, DOCX, or TXT.');
}

function extractSkills(text) {
  const lowered = text.toLowerCase();
  return SKILL_KEYWORDS.filter((skill) => lowered.includes(skill));
}

function extractYearsExperience(text) {
  const lowered = text.toLowerCase();
  let maxYears = 0;

  EXPERIENCE_PATTERNS.forEach((pattern) => {
    let match;
    while ((match = pattern.exec(lowered)) !== null) {
      const years = Number(match[1]);
      if (!Number.isNaN(years) && years > maxYears) {
        maxYears = years;
      }
    }
  });

  return maxYears;
}

function stripHtml(html = '') {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findPublicHRContact(job, cleanDescription) {
  const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
  const emailMatches = cleanDescription.match(emailRegex);

  if (emailMatches && emailMatches.length > 0) {
    return emailMatches[0];
  }

  if (job.candidate_required_location) {
    return `Not listed publicly (try recruiter search for ${job.company_name} in ${job.candidate_required_location})`;
  }

  return `Not listed publicly (try recruiter search for ${job.company_name})`;
}

function estimateATSAlignment(resumeSkills, resumeYears, job, cleanDescription) {
  const jobText = `${job.title} ${job.tags?.join(' ') || ''} ${cleanDescription}`.toLowerCase();

  const overlapSkills = resumeSkills.filter((skill) => jobText.includes(skill));
  const totalSkillWeight = Math.min(resumeSkills.length, 12);
  const skillScore = totalSkillWeight === 0 ? 35 : Math.round((overlapSkills.length / totalSkillWeight) * 60);

  const yearsMatch = cleanDescription.match(/(\d+)\+?\s*years?/i);
  const requiredYears = yearsMatch ? Number(yearsMatch[1]) : 0;

  let experienceScore = 25;
  if (requiredYears > 0) {
    if (resumeYears >= requiredYears) {
      experienceScore = 40;
    } else if (resumeYears >= Math.max(requiredYears - 1, 0)) {
      experienceScore = 24;
    } else {
      experienceScore = 10;
    }
  }

  const keywordBoost = /(immediate|urgent|hiring now|active)/i.test(cleanDescription) ? 5 : 0;
  const rawScore = Math.min(skillScore + experienceScore + keywordBoost, 100);

  return {
    score: rawScore,
    matchedSkills: overlapSkills,
    requiredYears,
  };
}

async function fetchJobs() {
  const response = await fetch('https://remotive.com/api/remote-jobs?limit=75');
  if (!response.ok) {
    throw new Error('Unable to fetch job postings from provider.');
  }

  const data = await response.json();
  return data.jobs || [];
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.post('/api/match-jobs', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Resume file is required.' });
  }

  let extractedText = '';
  try {
    extractedText = await extractTextFromResume(req.file.path, req.file.mimetype, req.file.originalname);

    if (!extractedText || extractedText.trim().length < 40) {
      return res.status(400).json({
        error: 'Could not extract enough resume content. Please upload a complete resume.',
      });
    }

    const resumeSkills = extractSkills(extractedText);
    const resumeYears = extractYearsExperience(extractedText);
    const jobs = await fetchJobs();

    const normalizedResume = extractedText.toLowerCase();

    const rankedJobs = jobs
      .map((job) => {
        const cleanDescription = stripHtml(job.description || '');
        const ats = estimateATSAlignment(resumeSkills, resumeYears, job, cleanDescription);

        const relevanceByResumeMentions = (
          [job.title, ...(job.tags || []), job.category, cleanDescription.slice(0, 600)]
            .join(' ')
            .toLowerCase()
            .split(/\W+/)
            .filter((token) => token.length > 3)
            .reduce((count, token) => (normalizedResume.includes(token) ? count + 1 : count), 0)
        );

        return {
          title: job.title,
          companyName: job.company_name,
          applicationLink: job.url,
          hrContact: findPublicHRContact(job, cleanDescription),
          location: job.candidate_required_location,
          publishedAt: job.publication_date,
          atsAlignment: ats.score,
          matchedSkills: ats.matchedSkills,
          requiredYears: ats.requiredYears,
          relevance: ats.score + relevanceByResumeMentions,
        };
      })
      .filter((job) => job.atsAlignment >= 35)
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 12);

    return res.json({
      profileSummary: {
        detectedSkills: resumeSkills,
        yearsOfExperience: resumeYears,
      },
      jobs: rankedJobs,
      totalFetched: jobs.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to match jobs.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`JobReady AI agent running on http://localhost:${PORT}`);
});
