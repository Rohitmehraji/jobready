const avatarInput = document.getElementById('avatarInput');
const avatarPreview = document.getElementById('avatarPreview');
const resumeForm = document.getElementById('resumeForm');
const resumeInput = document.getElementById('resumeInput');
const statusEl = document.getElementById('status');
const jobsContainer = document.getElementById('jobsContainer');
const profileSummary = document.getElementById('profileSummary');
const submitBtn = document.getElementById('submitBtn');

avatarInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    avatarPreview.src = reader.result;
  };
  reader.readAsDataURL(file);
});

function renderJobs(jobs) {
  if (!jobs.length) {
    jobsContainer.innerHTML = '<p>No strongly relevant active jobs found right now. Try updating your resume keywords.</p>';
    return;
  }

  jobsContainer.innerHTML = jobs
    .map(
      (job) => `
      <article class="job-card">
        <span class="ats-badge">ATS alignment: ${job.atsAlignment}%</span>
        <h3>${job.title}</h3>
        <div class="meta"><strong>Company:</strong> ${job.companyName}</div>
        <div class="meta"><strong>Location:</strong> ${job.location || 'Not specified'}</div>
        <div class="meta"><strong>Public HR contact:</strong> ${job.hrContact}</div>
        <div class="meta"><strong>Matched skills:</strong> ${job.matchedSkills?.join(', ') || 'Not detected'}</div>
        <a href="${job.applicationLink}" target="_blank" rel="noopener noreferrer">Apply on official job link</a>
      </article>
      `,
    )
    .join('');
}

async function uploadResume(file) {
  const uploadForm = new FormData();
  uploadForm.append('resume', file);

  const uploadResponse = await fetch('/api/resumes/upload', {
    method: 'POST',
    body: uploadForm,
  });

  const uploadData = await uploadResponse.json();
  if (!uploadResponse.ok) {
    throw new Error(uploadData.error || 'Resume upload failed.');
  }

  return uploadData;
}

async function matchJobs(resumeId) {
  const matchResponse = await fetch('/api/jobs/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ resumeId }),
  });

  const matchData = await matchResponse.json();
  if (!matchResponse.ok) {
    throw new Error(matchData.error || 'Unable to match jobs.');
  }

  return matchData;
}

resumeForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = resumeInput.files?.[0];
  if (!file) {
    statusEl.textContent = 'Please upload your resume first.';
    return;
  }

  submitBtn.disabled = true;
  statusEl.textContent = 'Step 1/2: Uploading and parsing resume...';
  jobsContainer.innerHTML = '';

  try {
    const uploaded = await uploadResume(file);

    statusEl.textContent = 'Step 2/2: Fetching active jobs and ranking matches...';
    const data = await matchJobs(uploaded.resumeId);

    const skills = data.profileSummary.detectedSkills.length
      ? data.profileSummary.detectedSkills.join(', ')
      : 'No common tech skills detected';

    profileSummary.classList.remove('hidden');
    profileSummary.innerHTML = `
      <strong>Resume profile:</strong> ~${data.profileSummary.yearsOfExperience || 0}+ years experience | Skills: ${skills}
      <br />
      <small>Fetched ${data.totalFetched} active jobs and ranked the top ${data.jobs.length} by resume relevance.</small>
    `;

    renderJobs(data.jobs);
    statusEl.textContent = 'Done. Here are your strongest matches.';
  } catch (error) {
    statusEl.textContent = error.message;
  } finally {
    submitBtn.disabled = false;
  }
});
