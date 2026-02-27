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

resumeForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const file = resumeInput.files?.[0];
  if (!file) {
    statusEl.textContent = 'Please upload your resume first.';
    return;
  }

  const formData = new FormData();
  formData.append('resume', file);

  submitBtn.disabled = true;
  statusEl.textContent = 'Analyzing resume and fetching active jobs...';
  jobsContainer.innerHTML = '';

  try {
    const response = await fetch('/api/match-jobs', {
      method: 'POST',
      body: formData,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Unable to process resume.');
    }

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
