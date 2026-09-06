/* =========================================================================
 * core.js  ·  r00tp4rv terminal, VFS and site behaviour
 * =========================================================================
 * Flag verification, the sudo gate and progress tracking all live in ctf.js,
 * which must load first. This file is presentation and interaction only, and
 * deliberately holds no secrets.
 * ========================================================================= */

/* One source of truth for the motion preference, read once. Respecting this
 * is an accessibility requirement, not a nicety: a full screen matrix rain
 * is exactly the kind of thing that triggers vestibular symptoms. */
const PREFERS_REDUCED_MOTION =
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ctf.js exposes the engine. If it failed to load we degrade loudly rather
 * than silently accepting every flag. */
const Engine = window.CTFEngine || null;

/* ---------------- Matrix background ---------------- */
(function(){
  const canvas = document.getElementById('matrix'); if(!canvas) return;
  const ctx = canvas.getContext('2d');
  if(!ctx) return;   // no 2d context (very old browser, or a test harness)
  let W,H,cols,ypos;
  function fit(){ W=canvas.width=innerWidth; H=canvas.height=innerHeight; cols=Math.max(8,Math.floor(W/18)); ypos=Array(cols).fill(0); }
  fit();
  const letters = 'abcdefghijklmnopqrstuvwxyz0123456789@#$%&*()<>/\\|';

  function paint(){
    ctx.fillStyle = 'rgba(2,3,5,0.08)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = 'rgba(124,255,76,0.85)';
    ctx.font = '14px "Share Tech Mono", monospace';
    for(let i=0;i<cols;i++){
      const ch = letters.charAt(Math.floor(Math.random()*letters.length));
      const x = i*18, y = ypos[i]*18;
      ctx.fillText(ch, x, y);
      if(y > H && Math.random() > 0.975) ypos[i] = 0;
      ypos[i]++;
    }
  }

  /* Reduced motion: paint a few frames for texture, then stop for good. */
  if(PREFERS_REDUCED_MOTION){
    for(let i=0;i<40;i++) paint();
    window.addEventListener('resize', ()=>{ fit(); for(let i=0;i<40;i++) paint(); });
    return;
  }

  /* The old loop ran forever, including while the tab was in the background,
   * burning battery to animate something nobody was looking at. */
  let raf = null;
  function frame(){ paint(); raf = requestAnimationFrame(frame); }
  function start(){ if(raf === null) raf = requestAnimationFrame(frame); }
  function stop(){ if(raf !== null){ cancelAnimationFrame(raf); raf = null; } }

  document.addEventListener('visibilitychange', ()=> document.hidden ? stop() : start());

  let resizeTimer = null;
  window.addEventListener('resize', ()=>{
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(fit, 120);
  });

  start();
})();

/* ---------------- Terminal + VFS + Sudo flow ---------------- */
(function(){
  const terminal = document.getElementById('terminal');

  // lines container
  const lines = document.getElementById('terminal-lines') || (function(){
    const d = document.createElement('div'); d.id = 'terminal-lines'; terminal.appendChild(d); return d;
  })();

  const cmdHistory = [];
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
      // `protected` on the directory itself, so `ls /root` is denied the
      // same way `cd /root` is. Previously only the file was protected, so a
      // non-root user could list the directory and see root.txt sitting there.
      'root': { type:'dir', protected: true, children: {
        // No content here on purpose. This file's bytes ship as AES-GCM
        // ciphertext in ctf.js and are decrypted with a key derived from the
        // sudo password. Reading this source gets you nothing.
        'root.txt': { type:'file', content: null, vault: 'root_txt', protected: true }
      }}
    }
  };

  // ensure /Users/r00tp4rv/chall exists with files, and add chall.txt (moved from old ctf command)
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

    // NEW: add chall.txt that contains the previous `ctf` output and a misc hint for flag_4
    const chall = u['r00tp4rv'].children.chall.children;
    chall['chall.txt'] = {
      type: 'file',
      content:
`Flag_1s aren't flagging these days - SG93IG1hbnkgYmFzZXMgYXJlIHRoZXJlPyAKV2prR3lYWVV4WTEyY20yWmlqMXRtOGpiQVBYRkYyR0V6UWVjczRkQVNGRmFBdHQ4RVJzblhKZ0tSSHJ3bjQ2ZDRFZU1KQ3RSQ0hvSndoZzJCS3ZhaUEzR2tpOFNzMzdkTkFkNTFGVUQ0MVdid3RvOXlENERob3RpQ2hHcDYxUnREdnVWd3dlcEhCajlkcWg5Vlh6c3pr

I have heard that flag_2 hides in shadows

Are you root? no? then you can't find flag_3. (Note: flag_3 must be obtained before attempting flag_5)

How about a little misc for flag_4:
aHR0cHM6Ly9kcml2ZS5nb29nbGUuY29tL2RyaXZlL2ZvbGRlcnMvMUtVdHlDZkpZazgwdFZZYmRSNFNycS1nTW1Hd0s3TmNMP3VzcD1zaGFyZV9saW5r

OSINT final flag_5: aHR0cHM6Ly9kcml2ZS5nb29nbGUuY29tL2RyaXZlL2ZvbGRlcnMvMXN3Tldnd1F6UDBvbTY2b29oUUc2QmhWSlhaS2NlczVLP3VzcD1zaGFyaW5n`
    };
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
    // Never report a real size for something the caller cannot read, or
    // `ls -la` becomes an oracle for the length of the flag inside.
    const readable = checkAccess(node);
    const rawSize = node.type === 'dir' ? 4096 : (node.content ? node.content.length : 0);
    const size = String(readable ? rawSize : 0).padStart(5,' ');
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

  /* ---------- base64 + a minimal pipeline ---------- */

  /* Strip one layer of surrounding quotes, including the curly quotes that
     iOS substitutes for straight ones. Without this, pasting a quoted blob
     from a phone silently fails. */
  function unquote(s){
    s = (s || '').trim();
    const pairs = [['"','"'], ["'","'"], ['\u201C','\u201D'], ['\u2018','\u2019']];
    // Loop: a value pasted from a phone can end up quoted more than once.
    for(let guard = 0; guard < 4; guard++){
      let stripped = false;
      for(const [open, close] of pairs){
        if(s.length >= 2 && s.startsWith(open) && s.endsWith(close)){
          s = s.slice(1, -1).trim();
          stripped = true;
          break;
        }
      }
      if(!stripped) break;
    }
    return s;
  }

  function b64Decode(str){
    try{
      // Tolerate whitespace and newlines inside the blob, and missing padding.
      let clean = String(str).replace(/[\s"'\u201C\u201D\u2018\u2019]+/g, '');
      if(!clean) return null;
      if(!/^[A-Za-z0-9+/=_-]+$/.test(clean)) return null;
      clean = clean.replace(/-/g, '+').replace(/_/g, '/');   // url-safe base64
      while(clean.length % 4) clean += '=';
      const bin = atob(clean);
      const bytes = Uint8Array.from(bin, function(c){ return c.charCodeAt(0); });
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }catch(e){ return null; }
  }

  function b64Encode(str){
    try{
      const bytes = new TextEncoder().encode(String(str));
      let bin = '';
      bytes.forEach(function(b){ bin += String.fromCharCode(b); });
      return btoa(bin);
    }catch(e){ return null; }
  }

  function isBase64Cmd(name){ return name === 'base64' || name === 'b64'; }
  function wantsDecode(args){
    return args.indexOf('-d') !== -1 || args.indexOf('-D') !== -1 ||
           args.indexOf('--decode') !== -1;
  }

  /* Produce the text a left hand pipeline stage emits. Returns null when the
     stage cannot run, so the caller can print a shell-like error. */
  async function stageOutput(stage){
    const text = stage.trim();
    const parts = text.split(/\s+/);
    const base = (parts[0] || '').toLowerCase();

    if(base === 'echo'){
      return unquote(text.slice(text.indexOf('echo') + 4));
    }

    if(base === 'cat'){
      const target = parts.slice(1).join(' ');
      const res = resolvePath(target);
      if(!res || res.node.type !== 'file' || !checkAccess(res.node)) return null;
      if(res.node.vault){
        return Engine ? await Engine.readVault(res.node.vault) : null;
      }
      return res.node.content == null ? '' : res.node.content;
    }

    if(isBase64Cmd(base)){
      const args = parts.slice(1);
      const rest = unquote(args.filter(function(a){
        return a !== '-d' && a !== '-D' && a !== '--decode';
      }).join(' '));
      if(!rest) return null;
      return wantsDecode(args) ? b64Decode(rest) : b64Encode(rest);
    }

    return null;
  }

  async function runPipeline(cmdline){
    const stages = cmdline.split('|').map(function(s){ return s.trim(); }).filter(Boolean);
    if(stages.length !== 2){
      await typeLine('Only simple two stage pipelines are supported, for example: echo "..." | base64 -d');
      return;
    }

    const input = await stageOutput(stages[0]);
    if(input === null){
      await typeLine((stages[0].split(/\s+/)[0] || 'pipeline') + ': cannot read input');
      return;
    }

    const parts = stages[1].split(/\s+/);
    const base = (parts[0] || '').toLowerCase();
    if(!isBase64Cmd(base)){
      await typeLine(base + ': not supported on the right of a pipe (try base64 -d)');
      return;
    }

    const out = wantsDecode(parts.slice(1)) ? b64Decode(input) : b64Encode(input);
    if(out === null){ await typeLine('base64: invalid input'); return; }
    await typeLine(out);
  }

  /* ---------- command execution ---------- */
  async function runCommand(cmdline){
    if(awaitingSudoPassword){
      appendText('(waiting for password, complete the Password: prompt)');
      return;
    }

    const cmd = (cmdline||'').trim();
    if(!cmd) return;

    // A pipe means the whole line is a pipeline, so handle it before the
    // normal single command dispatch below.
    if(cmd.indexOf('|') !== -1){ await runPipeline(cmd); return; }

    const parts = cmd.split(/\s+/);
    const base = parts[0].toLowerCase();

        // Caller (the Enter handler) creates the prompt once we return.
    if(base === 'clear'){ lines.innerHTML = ''; await printStartupLines(); return; }
    if(base === 'help'){ await typeLine('available: whoami | moreinfo | flag <value> | progress | ls | ls -la | cat <file> | echo <text> | base64 [-d] <text> | pwd | cd <dir> | sudo su | exit | help | clear');
      await typeLine('Pipes work too: echo "<text>" | base64 -d   and   cat <file> | base64 -d'); await typeLine('Tip: press Tab to autocomplete commands & filenames.'); return; }
    if(base === 'exit'){
      if(isRoot){
        isRoot = false;
        // Drop the derived key with the privilege, and walk the user out
        // of any directory they can no longer read.
        if(Engine) Engine.lock();
        if(cwd === '/root' || cwd.startsWith('/root/')) cwd = HOME + '/chall';
        appendText('Exiting root. Dropped to normal user.');
      } else appendText('exit');
      return;
    }
    if(base === 'whoami'){ await typeLine(isRoot ? 'root' : 'Parv (aka r00tp4rv), Product Security Engineer'); return; }
    if(base === 'moreinfo'){ await typeLine('well versed in Web, Mobile, OSINT, Crypto and Steganography'); return; }
    // ctf command removed — behavior moved to chall.txt (see /Users/r00tp4rv/chall/chall.txt)

    if(base === 'progress' || base === 'score'){
      if(parts[1] === 'reset'){
        Engine && Engine.Progress.reset();
        window.renderCtfProgress && window.renderCtfProgress();
        await typeLine('Progress cleared.');
        return;
      }
      if(!Engine){ await typeLine('progress: CTF engine unavailable.'); return; }
      const P = Engine.Progress;
      appendText('captured ' + P.count() + '/' + P.total());
      for(const s of Engine.slots){
        appendText('  [' + (P.has(s.id) ? 'x' : ' ') + '] ' + s.label + '  ' + s.hint);
      }
      if(P.hasBonus()) appendText('  [x] bonus   xp');
      if(P.isComplete()) appendText('All five captured. Nicely done.');
      return;
    }

    if(base === 'echo'){
      await typeLine(unquote(cmd.slice(4)));
      return;
    }

    if(isBase64Cmd(base)){
      const args = parts.slice(1);
      const rest = unquote(args.filter(function(a){
        return a !== '-d' && a !== '-D' && a !== '--decode';
      }).join(' '));
      if(!rest){
        await typeLine('Usage: base64 [-d] <text>');
        await typeLine('   or: echo "<text>" | base64 -d');
        return;
      }
      const out = wantsDecode(args) ? b64Decode(rest) : b64Encode(rest);
      if(out === null){ await typeLine('base64: invalid input'); return; }
      await typeLine(out);
      return;
    }

    if(base === 'pwd'){ await typeLine(cwd); return; }

    if(base === 'cd'){
      const target = parts.slice(1).join(' ') || '~';
      const res = resolvePath(target);
      if(!res){ await typeLine('cd: ' + target + ': No such file or directory'); return; }
      if(!checkAccess(res.node)){ await typeLine('cd: ' + target + ': Permission denied.'); return; }
      if(res.node.type !== 'dir'){ await typeLine('cd: ' + target + ': Not a directory'); return; }
      cwd = res.path === '' ? '/' : res.path;
      return;
    }

    if(base === 'ls'){
      const arg1 = parts[1] || '';
      const long = parts.includes('-l') || parts.includes('-la') || arg1 === '-la';
      // Exclude argv[0] by position, not by comparing it to the literal
      // 'ls'. The old check meant `LS` was parsed as `ls LS`.
      const target = (parts.slice(1).find(p => p && !p.startsWith('-')) || '.');
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

      // Vault backed files hold ciphertext until the sudo gate is passed.
      if(res.node.vault){
        const plaintext = Engine ? await Engine.readVault(res.node.vault) : null;
        if(plaintext === null){ await typeLine('cat: ' + targetRaw + ': Permission denied'); return; }
        await typeLine(plaintext);
        return;
      }

      await typeLine(res.node.content == null ? '' : res.node.content);
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
      // Previously this had its own hardcoded list of five flags while the
      // checker card had a different list of four. One path now, so the two
      // surfaces can never disagree again.
      const res = await window.ctfSubmit(val);
      appendRaw(res.html);
      return;
    }

    await typeLine('Command not found: ' + base);
  }

  /* ---------- Masked password prompt ---------- */
  function createMaskedPasswordPrompt(){
    const row = document.createElement('div'); row.className = 'prompt-row';
    const label = document.createElement('span'); label.className = 'user'; label.textContent = 'Password:';
    const input = document.createElement('span'); input.className = 'cmd-line empty pwd'; input.setAttribute('contenteditable','true');
    input.setAttribute('spellcheck','false'); input.setAttribute('role','textbox');
    input.setAttribute('autocapitalize','none');
    input.setAttribute('autocorrect','off');
    input.setAttribute('aria-label','sudo password');
    input.dataset.real = '';
    row.appendChild(label); row.appendChild(input);
    lines.appendChild(row);
    terminal.scrollTop = terminal.scrollHeight;
    placeCaretAtEnd(input);
    input.focus();

    function finishPasswordInput(){
      awaitingSudoPassword = false;
      const real = (input.dataset.real || '');
      input.removeAttribute('contenteditable'); input.classList.remove('empty');
      input.textContent = '\u2022'.repeat(Math.max(real.length, 6));
      currentPasswordPrompt = null;
      handleSudoPasswordSubmission(real);
    }

    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); finishPasswordInput(); return; }
      if(e.key === 'Backspace'){
        e.preventDefault();
        input.dataset.real = (input.dataset.real || '').slice(0, -1);
        input.textContent = '\u2022'.repeat((input.dataset.real || '').length) || '';
        placeCaretAtEnd(input); return;
      }
      if(e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey){
        e.preventDefault();
        input.dataset.real = (input.dataset.real || '') + e.key;
        input.textContent = '\u2022'.repeat(input.dataset.real.length);
        placeCaretAtEnd(input);
        return;
      }
    });

    input.addEventListener('paste', function(e){
      e.preventDefault();
      let text = '';
      if(e.clipboardData && e.clipboardData.getData){
        text = e.clipboardData.getData('text/plain') || '';
      } else {
        text = window.clipboardData && window.clipboardData.getData ? window.clipboardData.getData('Text') : '';
      }
      if(!text) return;
      input.dataset.real = (input.dataset.real || '') + text;
      input.textContent = '\u2022'.repeat(input.dataset.real.length);
      placeCaretAtEnd(input);
    });

    // IME and some mobile keyboards write straight into the element.
    input.addEventListener('input', function(){
      const txt = input.textContent || '';
      if(txt.indexOf('\u2022') === -1 && txt.length > 0){
        input.dataset.real = txt.replace(/\r/g,'').replace(/\n/g,'');
        input.textContent = '\u2022'.repeat(input.dataset.real.length);
      }
      placeCaretAtEnd(input);
    });

    return input;
  }

  /*
   * Exactly one definition. There used to be two, and the one that won by
   * hoisting was the one missing this normalization, so a password pasted
   * with a stray newline failed for no visible reason.
   */
  async function handleSudoPasswordSubmission(entered){
    appendText('% Authenticating...');

    const candidate = (entered || '').replace(/\r/g,'').replace(/\n/g,'').trim();

    if(!Engine){
      appendRaw('<span style="color:var(--fail);font-weight:700">Authentication unavailable: CTF engine failed to load.</span>');
      createPrompt();
      return;
    }
    if(!Engine.cryptoAvailable){
      appendRaw('<span style="color:var(--fail);font-weight:700">Authentication unavailable: WebCrypto needs a secure context (https or localhost).</span>');
      createPrompt();
      return;
    }

    /*
     * No stored password to compare against. We derive a key from what was
     * typed and try to open the vault. A valid AES-GCM auth tag proves the
     * password was correct and hands us the plaintext in the same step.
     */
    const opened = await Engine.unlockWithPassword(candidate);

    if(opened !== null){
      isRoot = true;
      appendRaw('<span style="color:var(--neon);font-weight:700">\u2714 Authentication successful. You are root now.</span>');
      const termCard = document.querySelector('.mac-term');
      if(termCard && !PREFERS_REDUCED_MOTION){
        termCard.classList.add('victory');
        setTimeout(()=>termCard.classList.remove('victory'), 1600);
      }
      createPrompt();
      return;
    }

    appendRaw('<span style="color:var(--fail);font-weight:700">Sorry, try again.</span>');
    const termCard = document.querySelector('.mac-term');
    if(termCard && !PREFERS_REDUCED_MOTION){
      termCard.classList.add('error');
      setTimeout(()=>termCard.classList.remove('error'), 800);
    }
    createPrompt();
  }

  /* ---------- Prompt creation & Tab autocomplete ---------- */
  function createPrompt(){
    if(awaitingSudoPassword) return;

    const row = document.createElement('div'); row.className = 'prompt-row' + (isRoot ? ' root' : '');
    const user = document.createElement('span'); user.className = 'user';
    user.textContent = (isRoot ? 'root' : 'r00tp4rv') + (isRoot ? '@mac #' : '@mac ~ %');
    const input = document.createElement('span'); input.className = 'cmd-line empty'; input.setAttribute('contenteditable','true'); input.setAttribute('spellcheck','false'); input.setAttribute('role','textbox');
    // Phone keyboards otherwise capitalise the first letter of every command
    // and 'helpfully' autocorrect base64 blobs into prose.
    input.setAttribute('autocapitalize','none');
    input.setAttribute('autocorrect','off');
    input.setAttribute('autocomplete','off');
    input.setAttribute('aria-label','terminal command input');

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
        const cmds = ['whoami','moreinfo','flag','progress','ls','pwd','cd','cat','echo','base64','sudo','exit','help','clear'];
        const matches = cmds.filter(c => c.startsWith(token));
        if(matches.length === 1){ input.textContent = matches[0] + ' '; placeCaretAtEnd(input); updateEmpty(); return; }
        else if(matches.length > 1){ appendText(matches.join('  ')); return; } else return;
      }

      // filename autocomplete
      const pathFragment = token;
      let dirPath = cwd;
      let prefix = pathFragment;
      // Keep the directory part of the token so it can be put back on the
      // line. Without this, completing `cat /etc/pass` replaced the whole
      // token with the bare filename and produced `cat passwd`.
      let dirPrefix = '';
      if(pathFragment.includes('/')){
        const idx = pathFragment.lastIndexOf('/');
        const dirPart = pathFragment.slice(0, idx);
        dirPrefix = pathFragment.slice(0, idx + 1);
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
        input.textContent = before + dirPrefix + matches[0];
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
        if(cmdText.trim()) cmdHistory.unshift(cmdText.trim());
        histIndex = -1;
        await runCommand(cmdText);
        if(!awaitingSudoPassword) createPrompt();
      } else if(e.key === 'ArrowUp'){
        if(cmdHistory.length === 0) return;
        histIndex = Math.min(cmdHistory.length - 1, histIndex + 1);
        input.textContent = cmdHistory[histIndex] || '';
        placeCaretAtEnd(input); e.preventDefault();
      } else if(e.key === 'ArrowDown'){
        if(cmdHistory.length === 0) return;
        histIndex = Math.max(-1, histIndex - 1);
        input.textContent = histIndex === -1 ? '' : cmdHistory[histIndex];
        placeCaretAtEnd(input); e.preventDefault();
      }
    });

    /*
     * The password prompt already sanitised paste; this one did not. Pasting
     * markup into a contenteditable inserts live DOM, so `<img src=x
     * onerror=...>` executed on paste. Self-XSS only, but trivially avoidable:
     * take the plain text and insert it as text.
     */
    input.addEventListener('paste', function(e){
      e.preventDefault();
      let text = '';
      if(e.clipboardData && e.clipboardData.getData){
        text = e.clipboardData.getData('text/plain') || '';
      } else if(window.clipboardData && window.clipboardData.getData){
        text = window.clipboardData.getData('Text') || '';
      }
      if(!text) return;
      text = text.replace(/[\r\n]+/g, ' ');
      const sel = window.getSelection();
      if(sel && sel.rangeCount){
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(document.createTextNode(text));
        placeCaretAtEnd(input);
      } else {
        input.textContent = (input.textContent || '') + text;
        placeCaretAtEnd(input);
      }
      updateEmpty();
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

  /* ---------- Real terminal affordances ---------- */
  (function terminalAffordances(){
    if(!terminal) return;

    function activePrompt(){
      return lines.querySelector('.prompt-row .cmd-line[contenteditable="true"]');
    }

    /*
     * Click anywhere in the terminal and you are typing, exactly like a real
     * one. Guarded so that selecting text to copy a flag does not immediately
     * yank the caret away.
     */
    terminal.addEventListener('click', function(e){
      const sel = window.getSelection && window.getSelection();
      if(sel && String(sel).length > 0) return;          // user is selecting
      if(e.target && e.target.closest && e.target.closest('a')) return;
      const p = activePrompt();
      if(p && document.activeElement !== p) placeCaretAtEnd(p);
    });

    /* Control keys. Only ctrlKey: on macOS the meta chords belong to Safari
       and Chrome, and stealing Cmd+L from the address bar would be rude. */
    terminal.addEventListener('keydown', function(e){
      if(!e.ctrlKey || e.altKey || e.metaKey) return;
      const p = activePrompt();
      const key = (e.key || '').toLowerCase();

      if(key === 'l'){                                    // clear the screen
        e.preventDefault();
        if(awaitingSudoPassword) return;
        lines.innerHTML = '';
        (async function(){ await printStartupLines(); createPrompt(); })();
        return;
      }

      if(key === 'u'){                                    // kill the line
        e.preventDefault();
        if(!p) return;
        p.textContent = '';
        p.classList.add('empty');
        placeCaretAtEnd(p);
        return;
      }

      if(key === 'c'){                                    // abandon the line
        // Let a real copy through when there is a selection.
        const sel = window.getSelection && window.getSelection();
        if(sel && String(sel).length > 0) return;
        e.preventDefault();
        if(awaitingSudoPassword) return;
        if(!p) return;
        const text = p.textContent || '';
        p.removeAttribute('contenteditable');
        p.textContent = text + '^C';
        createPrompt();
        return;
      }
    });
  })();

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

/*
 * Animated startup: type the last-login line and the boot line,
 * then call createPrompt() so the prompt appears only after typing finishes.
 * Uses your existing `typeLine(text, speed)` and `appendText()` helpers.
 */
/*
 * Types the banner and nothing else. It deliberately does NOT create a prompt.
 *
 * It used to do both, which raced with `clear`: runCommand fired this without
 * awaiting it, then the Enter handler created its own prompt the moment
 * runCommand returned, while this function was still typing and about to
 * create a second one. Two prompts, half a banner. One owner per concern now.
 */
async function printStartupLines(){
  const last = 'Last login: ' + formattedLastLogin();
  const boot = 'Type \`help` to see available commands. Start the hunt with \`cat chall.txt`. Can you uncover all 5 flags?';

  // Instant for reduced motion: a typing animation is motion too.
  if(PREFERS_REDUCED_MOTION){
    appendText(last);
    appendText(boot);
    return;
  }

  await typeLine(last, 16);
  await new Promise(r => setTimeout(r, 380));
  await typeLine(boot, 16);
  await new Promise(r => setTimeout(r, 180));
}

// Startup: type the banner, then hand over to the prompt exactly once.
(async ()=>{
  await printStartupLines();
  createPrompt();
})();

  /* ================= Progress tracker + flag submission ================= */

  /*
   * One submission path for both surfaces: the `flag` command in the terminal
   * and the checker card on the right. They used to keep separate hardcoded
   * lists which had already drifted apart.
   *
   * Returns { kind, html } so each caller can render in its own idiom.
   */

  const CELEBRATE_MS = 5500;

  function confettiAvailable(){
    return !PREFERS_REDUCED_MOTION && !document.getElementById('ctf-confetti-canvas');
  }

  function startConfetti(opts){
    const o = opts || {};
    const durationMs = o.durationMs || CELEBRATE_MS;
    const particleCount = o.particleCount || 220;
    if(!confettiAvailable()) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'ctf-confetti-canvas';
    canvas.setAttribute('aria-hidden','true');
    canvas.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:999999';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if(!ctx){ canvas.remove(); return; }   // same guard as the matrix canvas
    let w = canvas.width = innerWidth, h = canvas.height = innerHeight;
    function onResize(){ w = canvas.width = innerWidth; h = canvas.height = innerHeight; }
    window.addEventListener('resize', onResize);

    const rand = (a,b) => a + Math.random()*(b-a);
    const colors = ['#FFD43B','#FF6B6B','#6BCB77','#4D96FF','#C084FC','#FF9F1C'];
    const particles = [];
    for(let i=0;i<particleCount;i++){
      const size = rand(6, 14);
      particles.push({
        x: rand(0, w), y: rand(-h*0.2, h*0.6),
        vx: rand(-2.5, 2.5), vy: rand(1, 6),
        size, rot: rand(0, Math.PI*2), vrot: rand(-0.15, 0.15),
        color: colors[i % colors.length],
        ttl: rand(durationMs*0.6, durationMs*1.2),
        start: performance.now() - rand(0, durationMs*0.25)
      });
    }

    let raf = requestAnimationFrame(function draw(now){
      ctx.clearRect(0,0,w,h);
      for(const p of particles){
        const age = now - p.start;
        if(age > p.ttl) continue;
        p.x += p.vx; p.y += p.vy; p.vy += 0.04; p.rot += p.vrot;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*0.7);
        ctx.restore();
      }
      raf = requestAnimationFrame(draw);
    });

    setTimeout(()=>{
      cancelAnimationFrame(raf);
      // The old version leaked this listener on every run.
      window.removeEventListener('resize', onResize);
      canvas.style.transition = 'opacity 600ms ease';
      canvas.style.opacity = '0';
      setTimeout(()=>{ try{ canvas.remove(); }catch(e){} }, 650);
    }, durationMs);
  }

  /* ---------------------------- progress UI ---------------------------- */

  function ensureProgressHost(){
    let host = document.getElementById('ctf-progress');
    if(host) return host;
    const card = document.getElementById('flag-card');
    if(!card) return null;
    host = document.createElement('div');
    host.id = 'ctf-progress';
    host.className = 'ctf-progress';
    const body = card.querySelector('.flag-body');
    if(body) body.appendChild(host); else card.appendChild(host);
    return host;
  }

  function slotEl(slot, captured){
    const li = document.createElement('li');
    li.className = 'ctf-slot';
    li.dataset.slot = slot.id;
    li.dataset.state = captured ? 'captured' : 'locked';

    const mark = document.createElement('span');
    mark.className = 'ctf-slot-mark';
    mark.setAttribute('aria-hidden','true');
    mark.textContent = captured ? '✔' : '○';

    const name = document.createElement('span');
    name.className = 'ctf-slot-name';
    name.textContent = slot.label;

    const hint = document.createElement('span');
    hint.className = 'ctf-slot-hint';
    hint.textContent = slot.hint;

    li.appendChild(mark); li.appendChild(name); li.appendChild(hint);
    li.setAttribute('aria-label', slot.label + ', ' + slot.hint + ', ' + (captured ? 'captured' : 'not yet found'));
    return li;
  }

  /* Built with DOM APIs rather than innerHTML. Nothing here is user supplied
   * today, and building it this way means that stays true if it ever is. */
  function renderCtfProgress(){
    if(!Engine) return;
    const host = ensureProgressHost();
    if(!host) return;

    const P = Engine.Progress;
    const count = P.count();
    const total = P.total();
    const complete = P.isComplete();

    host.textContent = '';
    host.dataset.state = complete ? 'complete' : 'in-progress';

    const head = document.createElement('div');
    head.className = 'ctf-progress-head';

    const label = document.createElement('span');
    label.className = 'ctf-progress-label';
    label.textContent = complete ? 'all flags captured' : 'captured';

    const countEl = document.createElement('span');
    countEl.className = 'ctf-progress-count';
    const strong = document.createElement('b');
    strong.textContent = String(count);
    countEl.appendChild(strong);
    countEl.appendChild(document.createTextNode('/' + total));

    head.appendChild(label);
    head.appendChild(countEl);

    const bar = document.createElement('div');
    bar.className = 'ctf-progress-bar';
    bar.setAttribute('role','progressbar');
    bar.setAttribute('aria-valuemin','0');
    bar.setAttribute('aria-valuemax', String(total));
    bar.setAttribute('aria-valuenow', String(count));
    bar.setAttribute('aria-label','CTF flags captured');
    const fill = document.createElement('i');
    fill.style.width = (total ? (count / total) * 100 : 0) + '%';
    bar.appendChild(fill);

    const list = document.createElement('ul');
    list.className = 'ctf-slots';
    for(const s of Engine.slots) list.appendChild(slotEl(s, P.has(s.id)));

    // The bonus chip does not exist until it is found.
    if(P.hasBonus()) list.appendChild(slotEl(Engine.bonus, true));

    host.appendChild(head);
    host.appendChild(bar);
    host.appendChild(list);
  }

  window.renderCtfProgress = renderCtfProgress;

  function pulseSlot(id){
    if(PREFERS_REDUCED_MOTION) return;
    const el = document.querySelector('.ctf-slot[data-slot="' + id + '"]');
    if(!el) return;
    el.classList.add('just-captured');
    setTimeout(()=> el.classList.remove('just-captured'), 1200);
  }

  /* --------------------------- submission path -------------------------- */

  const MSG = {
    ok:   (t) => '<span style="color:var(--neon);font-weight:700">' + t + '</span>',
    bad:  (t) => '<span style="color:var(--fail);font-weight:700">' + t + '</span>',
    warn: (t) => '<span style="color:var(--accent);font-weight:700">' + t + '</span>',
    mute: (t) => '<span style="color:var(--muted)">' + t + '</span>'
  };

  async function ctfSubmit(rawValue, opts){
    const options = opts || {};

    if(!Engine)  return { kind:'noengine', html: MSG.bad('CTF engine failed to load. Try a hard refresh.') };
    if(!Engine.cryptoAvailable){
      return { kind:'nocrypto', html: MSG.bad('Cannot verify: WebCrypto needs https or localhost.') };
    }

    const res = await Engine.submitFlag(rawValue, options);

    switch(res.kind){
      case 'empty':
        return { kind:res.kind, html: MSG.bad('No input detected.') };

      case 'password': {
        // The RSA side quest points here: feed the checker the root password.
        return {
          kind: res.kind,
          html: MSG.ok('✔ Correct password. The final flag is ') +
                '<strong style="color:var(--neon)">' + escapeHtml(res.reveal) + '</strong>'
        };
      }

      case 'captured': {
        renderCtfProgress();
        pulseSlot(res.slot.id);
        if(res.completed){
          startConfetti();
          document.documentElement.classList.add('ctf-end');
          return {
            kind: res.kind,
            html: MSG.ok('✔ ' + res.slot.label + ' captured. That is all 5. You have pwned the r00tp4rv CTF.')
          };
        }
        // No running total here on purpose: the tracker directly below already
        // shows captured N/5. Repeating it made the count read three times.
        return {
          kind: res.kind,
          html: MSG.ok('✔ CORRECT. ' + res.slot.label + ' captured.')
        };
      }

      case 'already':
        return { kind:res.kind, html: MSG.warn('Already captured: ' + res.slot.label + '. Nothing new here.') };

      case 'bonus':
        renderCtfProgress();
        pulseSlot(Engine.bonus.id);
        return {
          kind: res.kind,
          html: res.already
            ? MSG.warn('Bonus flag already captured.')
            : MSG.ok('✔ Bonus flag captured. That one is not part of the 5.')
        };

      case 'decoy':
        return { kind:res.kind, html: MSG.bad('haha, nice try!') };

      case 'case':
        // Right flag, wrong capitalisation. Saying so beats a flat "incorrect"
        // when the only problem is a phone keyboard.
        return { kind:res.kind, html: MSG.warn('So close. Check your capitalisation.') };

      default:
        return { kind:'wrong', html: MSG.bad('✖ INCORRECT. Try again.') };
    }
  }

  window.ctfSubmit = ctfSubmit;

  /* --------------------------- flag card wiring ------------------------- */

  function initFlagChecker(attemptsLeft){
    if(attemptsLeft === undefined) attemptsLeft = 8;
    const btn = document.getElementById('flag-btn');
    const input = document.getElementById('flag-input');
    let status = document.getElementById('flag-status');

    if(!btn || !input){
      if(attemptsLeft > 0) return setTimeout(()=> initFlagChecker(attemptsLeft - 1), 200);
      return;
    }

    if(!status){
      const container = document.getElementById('flag-card') || document.body;
      status = document.createElement('div');
      status.id = 'flag-status';
      status.className = 'flag-status';
      container.appendChild(status);
    }

    renderCtfProgress();

    let busy = false;

    function readRaw(el){
      if(!el) return '';
      const tag = el.tagName ? el.tagName.toUpperCase() : '';
      if(tag === 'INPUT' || tag === 'TEXTAREA' || typeof el.value === 'string') return el.value || '';
      if(el.dataset && typeof el.dataset.real === 'string' && el.dataset.real.length) return el.dataset.real;
      return el.textContent || '';
    }

    function flashCard(ok){
      const card = document.getElementById('flag-card');
      if(!card || PREFERS_REDUCED_MOTION) return;
      const cls = ok ? 'victory' : 'error';
      card.classList.remove('victory','error');
      // reflow so the animation restarts on a repeat submission
      void card.offsetWidth;
      card.classList.add(cls);
      setTimeout(()=> card.classList.remove(cls), ok ? 1500 : 800);
    }

    async function onSubmit(){
      if(busy) return;            // guard against double submit
      busy = true;
      btn.disabled = true;
      try {
        const raw = readRaw(input);
        status.innerHTML = MSG.mute('checking…');

        // The password easter egg is accepted here but not in the terminal.
        const res = await ctfSubmit(raw, { allowPassword: true });
        status.innerHTML = res.html;

        const good = ['captured','password','bonus','already'].indexOf(res.kind) !== -1;
        flashCard(good);
        if(res.kind === 'captured' || res.kind === 'password'){
          const card = document.getElementById('flag-card');
          if(card && !PREFERS_REDUCED_MOTION){
            card.classList.add('final-victory');
            setTimeout(()=> card.classList.remove('final-victory'), 3500);
          }
        }
        if(res.kind === 'captured') input.value = '';
      } finally {
        busy = false;
        btn.disabled = false;
      }
    }

    btn.addEventListener('click', onSubmit);
    input.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); onSubmit(); }
    });
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=> initFlagChecker(8));
  } else {
    initFlagChecker(8);
  }

})();
/* ---------------- Mobile hamburger & sidebar behaviour ---------------- */
(function(){
  const hamburger = document.getElementById('hamburger');
  const sidebar = document.getElementById('mobile-sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  const closeBtn = document.getElementById('close-sidebar');

  if(!hamburger || !sidebar || !backdrop) return;

  function openSidebar(){
    hamburger.classList.add('open');
    hamburger.setAttribute('aria-expanded','true');
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden','false');
    backdrop.classList.add('open');
    backdrop.setAttribute('aria-hidden','false');
    const firstLink = sidebar.querySelector('.mobile-navlist a');
    if(firstLink) firstLink.focus();
    document.documentElement.style.overflow = 'hidden';
  }

  function closeSidebar(){
    hamburger.classList.remove('open');
    hamburger.setAttribute('aria-expanded','false');
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden','true');
    backdrop.classList.remove('open');
    backdrop.setAttribute('aria-hidden','true');
    hamburger.focus();
    document.documentElement.style.overflow = '';
  }

  hamburger.addEventListener('click', ()=>{
    const open = hamburger.classList.contains('open');
    if(open) closeSidebar(); else openSidebar();
  });

  closeBtn && closeBtn.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);

  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      if(sidebar.classList.contains('open')) closeSidebar();
    }
  });

  window.addEventListener('resize', ()=>{
    if(window.innerWidth > 720){
      if(sidebar.classList.contains('open')) closeSidebar();
    }
  });

  sidebar.addEventListener('click', (e)=>{
    if(e.target.tagName.toLowerCase() === 'a') closeSidebar();
  });
})();