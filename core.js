/* ---------------- Matrix background ---------------- */
(function(){
  const canvas = document.getElementById('matrix'); if(!canvas) return;
  const ctx = canvas.getContext('2d'); let W,H,cols,ypos;
  function fit(){ W=canvas.width=innerWidth; H=canvas.height=innerHeight; cols=Math.max(8,Math.floor(W/18)); ypos=Array(cols).fill(0); }
  window.addEventListener('resize', fit);
  fit();
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789@#$%&*()<>/\\|';
  function frame(){
    ctx.fillStyle = 'rgba(0,0,0,0.06)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = 'rgba(124,255,76,0.85)'; ctx.font = '14px "Share Tech Mono", monospace';
    for(let i=0;i<cols;i++){
      const ch = letters.charAt(Math.floor(Math.random()*letters.length));
      ctx.fillText(ch, i*18, ypos[i]*16);
      if(ypos[i]*16 > H && Math.random() > 0.975) ypos[i] = 0;
      ypos[i]++;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();

/* ---------------- Terminal + VFS + Sudo flow ---------------- */
(function(){
  const terminal = document.getElementById('terminal');

  // lines container
  const lines = document.getElementById('terminal-lines') || (function(){
    const d = document.createElement('div'); d.id = 'terminal-lines'; terminal.appendChild(d); return d;
  })();

  const history = [];
  let histIndex = -1;

  // state
  let isRoot = false;
  const HOME = '/Users/r00tp4rv';
  let cwd = '/Users/r00tp4rv/chall';
  let awaitingSudoPassword = false;
  let currentPasswordPrompt = null;

  // VFS
  const VFS = {
    type: 'dir',
    name: '/',
    children: {
      'bin': { type: 'dir', children: {
        'ls': { type: 'file', content: 'ELF placeholder' },
        'cat': { type: 'file', content: 'ELF placeholder' }
      }},
      'etc': { type: 'dir', children: {
        'passwd': { type: 'file', content: 'root:x:0:0:root:/root:/bin/bash\nr00tp4rv:x:1000:1000:Parv:/home/r00tp4rv:/bin/zsh\nr00tr1t1:x:1001:1001:Riti:/home/r00tr1t1:/bin/bash #r00tp4rv{R1t1_h1d3s_1n_Sh4d0ws}' }
      }},
      'home': { type: 'dir', children: {} },
      'Users': { type: 'dir', children: {
        'r00tp4rv': { type: 'dir', children: {
          'notes.txt': { type:'file', content: "You might know the 8*8 encoding but the real question is how many times" }
        }},
        'r00tr1t1': { type:'dir', children: {
          'rootpass.txt': { type:'file', content: 'VmpGYWIxTXlTa2hXYkdoUVZrVmFjVmxzVW5OTmJIQkdVbFJzVVZWVU1Eaz0' },
          'readme.txt': { type:'file', content: 'hello from r00tr1t1' }
        }}
      }},
      'tmp': { type:'dir', children: {} },
      'root': { type:'dir', children: {
        'root.txt': { type:'file', content: 'r00tp4rv{r0071n9_15_fuN}', protected: true }
      }}
    }
  };

  // ensure /Users/r00tp4rv/chall exists with files
  (function ensureChall(){
    const u = VFS.children.Users.children;
    if(!u['r00tp4rv'].children.chall){
      u['r00tp4rv'].children.chall = { type:'dir', children: {
        'user.txt': { type:'file', content: 'Parv Bajaj' },
        'flag.txt': { type:'file', content: 'r00tp4rv{F4K3_FL4G_101}, but can you cd /root' }
      }};
    } else {
      const ch = u['r00tp4rv'].children.chall.children;
      ch['user.txt'] = ch['user.txt'] || { type:'file', content: 'Parv Bajaj' };
      ch['flag.txt'] = ch['flag.txt'] || { type:'file', content: 'r00tp4rv{F4K3_FL4G_101}' };
    }
  })();

  // helpers for printing / typing
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function appendRaw(html, cls='line'){ const el = document.createElement('div'); el.className = cls; el.innerHTML = html; lines.appendChild(el); terminal.scrollTop = terminal.scrollHeight; return el; }
  function appendText(txt, cls='line'){ return appendRaw(escapeHtml(txt), cls); }
  function typeLine(text, speed=12){
    return new Promise(resolve=>{
      const el = document.createElement('div'); el.className='line'; lines.appendChild(el);
      let i = 0;
      function step(){ if(i <= text.length){ el.textContent = text.slice(0,i); terminal.scrollTop = terminal.scrollHeight; i++; setTimeout(step, speed); } else resolve(); }
      step();
    });
  }

  // path helpers
  function getNodeByPath(abs){
    if(!abs) return null;
    if(abs === '/' || abs === '') return VFS;
    const parts = abs.split('/').filter(Boolean);
    let cur = VFS;
    for(const p of parts){
      if(!cur.children || !cur.children[p]) return null;
      cur = cur.children[p];
    }
    return cur;
  }

  function resolvePath(pathStr){
    if(!pathStr) return { node: getNodeByPath(cwd), path: cwd };
    let p = pathStr.trim();
    if(p === '~') p = HOME;
    else if(p.startsWith('~' + '/')) p = HOME + p.slice(1);
    if(!p.startsWith('/')) p = (cwd === '/' ? '' : cwd) + '/' + p;
    const parts = p.split('/').filter(Boolean);
    const stack = [];
    for(const part of parts){
      if(part === '.') continue;
      if(part === '..'){ if(stack.length) stack.pop(); continue; }
      stack.push(part);
    }
    const abs = '/' + stack.join('/');
    const node = getNodeByPath(abs);
    if(node) return { node, path: abs };
    return null;
  }

  function listDir(node){
    if(!node || node.type !== 'dir' || !node.children) return [];
    return Object.keys(node.children).sort();
  }

  function formatLsLaLine(name, node){
    const perms = node.type === 'dir' ? 'drwxr-xr-x' : '-rw-r--r--';
    const nlink = '1';
    const owner = 'r00tp4rv';
    const group = 'staff';
    const size = String(node.type === 'dir' ? 4096 : (node.content ? node.content.length : 0)).padStart(5,' ');
    const m = new Date();
    const mon = m.toLocaleString(undefined, {month:'short'});
    const day = String(m.getDate()).padStart(2,' ');
    const hh = String(m.getHours()).padStart(2,'0');
    const mm = String(m.getMinutes()).padStart(2,'0');
    return `${perms}  ${nlink} ${owner}  ${group} ${size} ${mon} ${day} ${hh}:${mm} ${name}`;
  }

  function checkAccess(node){
    if(!node) return false;
    if(node.protected && !isRoot) return false;
    return true;
  }

  /* ---------- command execution ---------- */
  async function runCommand(cmdline){
    if(awaitingSudoPassword){
      appendText('(waiting for password — complete the Password: prompt)');
      return;
    }

    const cmd = (cmdline||'').trim();
    if(!cmd) return;
    const parts = cmd.split(/\s+/);
    const base = parts[0].toLowerCase();

    if(base === 'clear'){ lines.innerHTML = ''; addStartupLines(); return; }
    if(base === 'help'){ await typeLine('available: whoami | moreinfo | ctf | flag <value> | ls | ls -la | cat <file> | pwd | cd <dir> | sudo su | exit | help | clear'); await typeLine('Tip: press Tab to autocomplete commands & filenames.'); return; }
    if(base === 'exit'){ if(isRoot){ isRoot = false; appendText('Exiting root. Dropped to normal user.'); } else appendText('exit'); return; }
    if(base === 'whoami'){ await typeLine(isRoot ? 'root' : 'Parv (aka r00tp4rv) — Product Security Engineer'); return; }
    if(base === 'moreinfo'){ await typeLine('well versed in Web, Mobile, OSINT, Crypto and Steganography'); return; }
if (base === 'ctf') {
  await typeLine(`Flag_1s aren't flagging these days - SG93IG1hbnkgYmFzZXMgYXJlIHRoZXJlPyAKV2prR3lYWVV4WTEyY20yWmlqMXRtOGpiQVBYRkYyR0V6UWVjczRkQVNGRmFBdHQ4RVJzblhKZ0tSSHJ3bjQ2ZDRFZU1KQ3RSQ0hvSndoZzJCS3ZhaUEzR2tpOFNzMzdkTkFkNTFGVUQ0MVdid3RvOXlENERob3RpQ2hHcDYxUnREdnVWd3dlcEhCajlkcWg5Vlh6c3pr`);
  if (!isRoot) {
     await typeLine('I have heard that flag_2 hides in shadows')
     await typeLine('Are you root? no? then you can\'t find flag_3');
  } else {
    await typeLine('You are root — try: cd /root && cat root.txt');
  }
  return;
}
    if(base === 'pwd'){ await typeLine(cwd); return; }

    if(base === 'cd'){
      const target = parts.slice(1).join(' ') || '~';
      const res = resolvePath(target);
      if(!res){ await typeLine('cd: ' + target + ': No such file or directory'); return; }
      if(res.path === '/root' || res.path.startsWith('/root/')){ if(!isRoot){ await typeLine('cd: ' + target + ': Permission denied.'); return; } }
      if(res.node.type !== 'dir'){ await typeLine('cd: ' + target + ': Not a directory'); return; }
      cwd = res.path === '' ? '/' : res.path;
      return;
    }

    if(base === 'ls'){
      const arg1 = parts[1] || '';
      const long = parts.includes('-l') || parts.includes('-la') || arg1 === '-la';
      const target = (parts.find(p => p && !p.startsWith('-') && p !== 'ls') || '.');
      const res = resolvePath(target);
      if(!res){ await typeLine('ls: cannot access ' + target + ': No such file or directory'); return; }
      if(!checkAccess(res.node)){ await typeLine('ls: cannot open directory ' + target + ': Permission denied'); return; }
      if(res.node.type === 'file'){ appendText(target); return; }
      const names = listDir(res.node);
      if(long){ appendText('total ' + (names.length * 4)); for(const n of names) appendText(formatLsLaLine(n, res.node.children[n])); }
      else appendText(names.join('  '));
      return;
    }

    if(base === 'cat'){
      const targetRaw = parts.slice(1).join(' ');
      if(!targetRaw){ await typeLine('Usage: cat <file>'); return; }
      const res = resolvePath(targetRaw);
      if(!res){ await typeLine('cat: ' + targetRaw + ': No such file or directory'); return; }
      if(res.node.type !== 'file'){ await typeLine('cat: ' + targetRaw + ': Is a directory'); return; }
      if(!checkAccess(res.node)){ await typeLine('cat: ' + targetRaw + ': Permission denied'); return; }
      await typeLine(res.node.content);
      return;
    }

    if((base === 'sudo' && parts[1] === 'su') || (base === 'su' && (parts[1] === '-' || !parts[1]))){
      if(isRoot){ appendText('You are already root.'); return; }
      awaitingSudoPassword = true;
      currentPasswordPrompt = createMaskedPasswordPrompt();
      return;
    }

    if(base === 'flag'){
      const val = parts.slice(1).join(' ');
      if(!val){ await typeLine('Usage: flag <flag>'); return; }
      await typeLine('% Checking flag...');
      const ok = (val.trim() === 'r00tp4rv{g07_y0u_by_7h3_b4ll5}' || val.trim() === 'r00tp4rv{r0071n9_15_fuN}' || val.trim() === 'r00tp4rv{R1t1_h1d3s_1n_Sh4d0ws}' );
      if(ok){ appendRaw('<span style="color:var(--neon);font-weight:700">✔ CORRECT — flag accepted</span>'); window.updateFlagCard && window.updateFlagCard(true); }
      else { appendRaw('<span style="color:var(--fail);font-weight:700">✖ INCORRECT — try again</span>'); window.updateFlagCard && window.updateFlagCard(false); }
      return;
    }

    await typeLine('Command not found: ' + base);
  }

  /* ---------- Masked password prompt ---------- */
  function createMaskedPasswordPrompt(){
    const row = document.createElement('div'); row.className = 'prompt-row';
    const label = document.createElement('span'); label.className = 'user'; label.textContent = 'Password:';
    const input = document.createElement('span'); input.className = 'cmd-line empty pwd'; input.setAttribute('contenteditable','true'); input.setAttribute('spellcheck','false'); input.setAttribute('role','textbox');
    input.dataset.real = '';
    row.appendChild(label); row.appendChild(input);
    lines.appendChild(row);
    terminal.scrollTop = terminal.scrollHeight;
    placeCaretAtEnd(input);
    input.focus();

    function finishPasswordInput(){
      awaitingSudoPassword = false;
      const real = input.dataset.real || '';
      input.removeAttribute('contenteditable'); input.classList.remove('empty');
      input.textContent = '••••••';
      currentPasswordPrompt = null;
      handleSudoPasswordSubmission(real);
    }

    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); finishPasswordInput(); return; }
      if(e.key === 'Backspace'){ e.preventDefault(); input.dataset.real = (input.dataset.real || '').slice(0, -1); input.textContent = '•'.repeat((input.dataset.real || '').length) || ''; placeCaretAtEnd(input); return; }
      if(e.key.length === 1 && !e.ctrlKey && !e.metaKey){ e.preventDefault(); input.dataset.real = (input.dataset.real || '') + e.key; input.textContent = '•'.repeat(input.dataset.real.length); placeCaretAtEnd(input); return; }
    });

    return input;
  }

  async function handleSudoPasswordSubmission(entered){
    appendText('% Authenticating...');
    await new Promise(r => setTimeout(r, 700));
    const correct = (entered === 'areyouroot');
    if(correct){
      isRoot = true;
      appendRaw('<span style="color:var(--neon);font-weight:700">✔ Authentication successful — you are root now.</span>');
      const termCard = document.querySelector('.mac-term');
      if(termCard){
        termCard.classList.add('victory');
        setTimeout(()=>termCard.classList.remove('victory'), 1600);
      }
      // create fresh prompt immediately (root prompt)
      createPrompt();
      return;
    } else {
      appendRaw('<span style="color:var(--fail);font-weight:700">Sorry, try again.</span>');
      const termCard = document.querySelector('.mac-term');
      if(termCard){
        termCard.classList.add('error');
        setTimeout(()=>termCard.classList.remove('error'), 800);
      }
      createPrompt();
      return;
    }
  }

  /* ---------- Prompt creation & Tab autocomplete ---------- */
  function createPrompt(){
    if(awaitingSudoPassword) return;

    const row = document.createElement('div'); row.className = 'prompt-row' + (isRoot ? ' root' : '');
    const user = document.createElement('span'); user.className = 'user';
    user.textContent = (isRoot ? 'root' : 'r00tp4rv') + (isRoot ? '@mac #' : '@mac ~ %');
    const input = document.createElement('span'); input.className = 'cmd-line empty'; input.setAttribute('contenteditable','true'); input.setAttribute('spellcheck','false'); input.setAttribute('role','textbox');

    row.appendChild(user); row.appendChild(input); lines.appendChild(row);
    terminal.scrollTop = terminal.scrollHeight;
    placeCaretAtEnd(input);
    input.focus();

    function updateEmpty(){ const t = (input.textContent || '').trim(); if(!t) input.classList.add('empty'); else input.classList.remove('empty'); }
    updateEmpty();

    function currentToken(){ const txt = input.textContent || ''; const tokens = txt.split(/\s+/); const last = tokens[tokens.length-1] || ''; return { token: last, all: txt }; }

    async function handleTab(e){
      e.preventDefault();
      const { token, all } = currentToken();
      const cmdParts = all.trim().split(/\s+/);
      if(cmdParts.length === 1 && !all.endsWith(' ')){
        const cmds = ['whoami','moreinfo','ctf','flag','ls','pwd','cd','cat','sudo','exit','help','clear'];
        const matches = cmds.filter(c => c.startsWith(token));
        if(matches.length === 1){ input.textContent = matches[0] + ' '; placeCaretAtEnd(input); updateEmpty(); return; }
        else if(matches.length > 1){ appendText(matches.join('  ')); return; } else return;
      }

      // filename autocomplete
      const pathFragment = token;
      let dirPath = cwd;
      let prefix = pathFragment;
      if(pathFragment.includes('/')){
        const idx = pathFragment.lastIndexOf('/');
        const dirPart = pathFragment.slice(0, idx);
        prefix = pathFragment.slice(idx+1);
        const resolved = resolvePath(dirPart || '.');
        if(!resolved) { appendText('(no completion)'); return; }
        dirPath = resolved.path;
      }
      const dirNode = getNodeByPath(dirPath);
      if(!dirNode || dirNode.type !== 'dir'){ appendText('(no completion)'); return; }
      const children = Object.keys(dirNode.children || {});
      const matches = children.filter(name => name.startsWith(prefix));
      if(matches.length === 0){ appendText('(no completion)'); return; }
      if(matches.length === 1){
        let before = all.slice(0, all.length - token.length);
        input.textContent = before + matches[0];
        placeCaretAtEnd(input); updateEmpty();
      } else {
        appendText(matches.join('  '));
      }
    }

    input.addEventListener('keydown', async function(e){
      if(e.key === 'Tab'){ await handleTab(e); return; }
      if(e.key === 'Enter' && !e.shiftKey){
        e.preventDefault();
        const cmdText = input.textContent || '';
        input.removeAttribute('contenteditable'); input.classList.remove('empty');
        input.textContent = cmdText;
        if(cmdText.trim()) history.unshift(cmdText.trim());
        histIndex = -1;
        await runCommand(cmdText);
        if(!awaitingSudoPassword) createPrompt();
      } else if(e.key === 'ArrowUp'){
        if(history.length === 0) return;
        histIndex = Math.min(history.length - 1, histIndex + 1);
        input.textContent = history[histIndex] || '';
        placeCaretAtEnd(input); e.preventDefault();
      } else if(e.key === 'ArrowDown'){
        if(history.length === 0) return;
        histIndex = Math.max(-1, histIndex - 1);
        input.textContent = histIndex === -1 ? '' : history[histIndex];
        placeCaretAtEnd(input); e.preventDefault();
      }
    });

    input.addEventListener('input', updateEmpty);
    input.addEventListener('focus', updateEmpty);
    input.addEventListener('blur', updateEmpty);
  }

  function placeCaretAtEnd(el){
    el.focus();
    if(window.getSelection && document.createRange){
      const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
  }

  /* ---------- Startup lines ---------- */
  function formattedLastLogin(){
    const d = new Date();
    const weekday = d.toLocaleString(undefined, { weekday: 'short' });
    const month = d.toLocaleString(undefined, { month: 'short' });
    const day = d.getDate();
    const hh = String(d.getHours()).padStart(2,'0');
    const mm = String(d.getMinutes()).padStart(2,'0');
    const ss = String(d.getSeconds()).padStart(2,'0');
    return `${weekday} ${month} ${day} ${hh}:${mm}:${ss} on console`;
  }
  function addStartupLines(){
    appendText('Last login: ' + formattedLastLogin());
    appendText('Boot sequence complete. Type help to get started.');
  }

  // init
  addStartupLines();
  createPrompt();

  /* ---------- Global key: Ctrl+C clears (fixed, not plain 'c') ---------- */
  document.addEventListener('keydown', (e)=>{
    if(e.ctrlKey && e.key.toLowerCase() === 'c'){
      lines.innerHTML = '';
      addStartupLines();
      createPrompt();
    }
  });

  // expose runCommand
  window.runCommand = runCommand;

  /* ----------------- Flag card bridge (restore updateFlagCard) ----------------- */
  window.updateFlagCard = function(ok){
    const status = document.getElementById('flag-status');
    const card = document.getElementById('flag-card');
    if(!status || !card) return;
    if(ok){
      status.innerHTML = '<span class="ok">✔ CORRECT — flag accepted</span>';
      card.classList.remove('error'); card.classList.add('victory');
      setTimeout(()=> card.classList.remove('victory'), 1500);
    } else {
      status.innerHTML = '<span class="bad">✖ INCORRECT</span>';
      card.classList.remove('victory'); card.classList.add('error');
      setTimeout(()=> card.classList.remove('error'), 800);
    }
  };

  /* ----------------- Flag checker button handling ----------------- */
  (function(){
    const btn = document.getElementById('flag-btn');
    const input = document.getElementById('flag-input');
    if(!btn || !input) return;
    btn.addEventListener('click', async ()=>{
      const val = input.value.trim();
      if(!val){ window.updateFlagCard(false); return; }
      const status = document.getElementById('flag-status');
      status.innerHTML = '<span style="color:var(--muted)">checking…</span>';
      await new Promise(r=>setTimeout(r,700));
      const ok = (val === 'r00tp4rv{g07_y0u_by_7h3_b4ll5}' || val === 'r00tp4rv{r0071n9_15_fuN}' || val === 'r00tp4rv{R1t1_h1d3s_1n_Sh4d0ws}');
      window.updateFlagCard(ok);
    });
    input.addEventListener('keydown', e=>{ if(e.key === 'Enter'){ e.preventDefault(); btn.click(); } });
  })();

  /* ----------------- Count-up animation for stats ----------------- */
  (function restoreCountUp(){
    const targets = [
      { id: 's-ctfs', target: 25 },
      { id: 's-awards', target: 3 },
      { id: 's-pwns', target: 1337 }
    ];
    function animate(el, to, duration=1200){
      let start = null;
      const from = 0;
      function step(ts){
        if(!start) start = ts;
        const progress = Math.min((ts-start)/duration,1);
        el.textContent = Math.floor(from + (to-from)*progress);
        if(progress < 1) requestAnimationFrame(step); else el.textContent = to;
      }
      requestAnimationFrame(step);
    }
    // run on load and immediately (covers both cases)
    window.addEventListener('load', ()=>{
      for(const t of targets){
        const el = document.getElementById(t.id);
        if(el) animate(el, Number(el.dataset.target || t.target), 1200);
      }
    });
    for(const t of targets){
      const el = document.getElementById(t.id);
      if(el) animate(el, Number(el.dataset.target || t.target), 1200);
    }
  })();

})();