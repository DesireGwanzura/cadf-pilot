'use strict';
if (location.protocol === 'https:') {
  const status = document.querySelector('.sidefoot-status');
  if (status) status.textContent = 'Private hosted workspace';
  const signout = document.createElement('button');
  signout.textContent = 'Sign out';
  signout.addEventListener('click', async () => {
    const response = await fetch('/auth/logout', {
      method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{}'
    });
    if (response.ok) location.reload();
  });
  document.querySelector('.sidefoot')?.append(signout);
}
