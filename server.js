const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOAD_DIR = path.join(__dirname, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  dest: UPLOAD_DIR,
  limits: {
    fileSize: 8 * 1024 * 1024,
  },
});

const resumeStore = new Map();

const SKILL_KEYWORDS = [
  'javascript', 'typescript', 'react', 'next.js', 'node', 'express', 'python', 'java', 'c++',
  'sql', 'mongodb', 'postgresql', 'aws', 'azure', 'docker', 'kubernetes', 'git', 'rest',
  'graphql', 'machine learning', 'nlp', 'data analysis', 'power bi', 'tableau', 'figma',
  'html', 'css', 'tailwind', 'leadership', 'communication', 'agile', 'scrum', 'ci/cd',
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
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || ext === '.docx'
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

function buildResumeProfile(extractedText) {
  if (!extractedText || extractedText.trim().length < 40) {
    throw new Error('Could not extract enough resume content. Please upload a complete resume.');
  }

  return {
    rawText: extractedText,
    detectedSkills: extractSkills(extractedText),
    yearsOfExperience: extractYearsExperience(extractedText),
  };
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

async function fetchJobs(limit = 75) {
  const response = await fetch(`https://remotive.com/api/remote-jobs?limit=${limit}`);
  if (!response.ok) {
    throw new Error('Unable to fetch job postings from provider.');
  }

  const data = await response.json();
  return data.jobs || [];
}

function rankJobs(resumeProfile, jobs) {
  const normalizedResume = resumeProfile.rawText.toLowerCase();

  return jobs
    .map((job) => {
      const cleanDescription = stripHtml(job.description || '');
      const ats = estimateATSAlignment(
        resumeProfile.detectedSkills,
        resumeProfile.yearsOfExperience,
        job,
        cleanDescription,
      );

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
}

app.get('/healthz', (_req, res) => {
  res.status(200).send('ok');
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.json());

app.post('/api/resumes/upload', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Resume file is required.' });
  }

  try {
    const extractedText = await extractTextFromResume(req.file.path, req.file.mimetype, req.file.originalname);
    const profile = buildResumeProfile(extractedText);
    const resumeId = crypto.randomUUID();

    resumeStore.set(resumeId, {
      ...profile,
      createdAt: Date.now(),
      filename: req.file.originalname,
    });

    return res.json({
      resumeId,
      profileSummary: {
        detectedSkills: profile.detectedSkills,
        yearsOfExperience: profile.yearsOfExperience,
      },
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || 'Failed to process resume.' });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
});

app.get('/api/jobs/active', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 30;
    const jobs = await fetchJobs(Math.min(limit, 100));

    return res.json({
      totalFetched: jobs.length,
      jobs: jobs.map((job) => ({
        id: job.id,
        title: job.title,
        companyName: job.company_name,
        location: job.candidate_required_location,
        applicationLink: job.url,
        publishedAt: job.publication_date,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch active jobs.' });
  }
});

app.post('/api/jobs/match', async (req, res) => {
  try {
    const { resumeId } = req.body;

    if (!resumeId) {
      return res.status(400).json({ error: 'resumeId is required. Upload resume first via /api/resumes/upload.' });
    }

    const storedResume = resumeStore.get(resumeId);
    if (!storedResume) {
      return res.status(404).json({ error: 'resumeId not found or expired. Please upload resume again.' });
    }

    const jobs = await fetchJobs();
    const rankedJobs = rankJobs(storedResume, jobs);

    return res.json({
      profileSummary: {
        detectedSkills: storedResume.detectedSkills,
        yearsOfExperience: storedResume.yearsOfExperience,
      },
      jobs: rankedJobs,
      totalFetched: jobs.length,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to match jobs.' });
  }
});

app.post('/api/match-jobs', upload.single('resume'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Resume file is required.' });
  }

  try {
    const extractedText = await extractTextFromResume(req.file.path, req.file.mimetype, req.file.originalname);
    const profile = buildResumeProfile(extractedText);
    const jobs = await fetchJobs();
    const rankedJobs = rankJobs(profile, jobs);

    return res.json({
      profileSummary: {
        detectedSkills: profile.detectedSkills,
        yearsOfExperience: profile.yearsOfExperience,
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'jobready-ai-agent' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[startup] JobReady AI agent listening on 0.0.0.0:${PORT}`);
});
