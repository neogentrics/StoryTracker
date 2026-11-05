'use strict';

async function show() {
  const status = document.getElementById('status');
  try {
    const result = await window.storyTracker.status();
    if (!result.ok) throw new Error(result.error);
    const count = result.projects === 1 ? '1 project' : `${result.projects} projects`;
    status.textContent = `Version ${result.version}. Your library is ready, with ${count}.`;
    document.body.dataset.state = 'ready';
  } catch (error) {
    status.textContent = `The library didn't open: ${error.message}`;
    document.body.dataset.state = 'failed';
  }
}

show();
