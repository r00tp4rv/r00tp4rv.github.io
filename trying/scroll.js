/* terminal-scroll-safe.js — safer, defensive version */
(function(){
  'use strict';

  function $id(id){ try { return document.getElementById(id); } catch(e){ return null; } }

  function whenElement(selectorOrId, timeout = 6000){
    return new Promise((resolve) => {
      try {
        const byId = typeof selectorOrId === 'string' && selectorOrId[0] !== '.' && selectorOrId.indexOf('#') === -1;
        const check = () => byId ? $id(selectorOrId) || null : document.querySelector(selectorOrId);
        const el = check();
        if(el) return resolve(el);

        const obs = new MutationObserver(() => {
          const el2 = check();
          if(el2){
            obs.disconnect();
            resolve(el2);
          }
        });
        obs.observe(document.documentElement || document.body, { childList: true, subtree: true });

        // fallback timeout -> resolve whatever exists (maybe null)
        setTimeout(() => {
          try { obs.disconnect(); } catch(e){}
          resolve(check());
        }, timeout);
      } catch(e){
        resolve(null);
      }
    });
  }

  function focusPromptCaret(){
    try {
      const prompt = document.querySelector('.prompt-row .cmd-line[contenteditable="true"]');
      if(!prompt) return;
      prompt.focus();
      const sel = window.getSelection();
      if(!sel) return;
      const range = document.createRange();
      range.selectNodeContents(prompt);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e){
      // ignore
    }
  }

  // main init
  whenElement('terminal', 6000).then((terminalEl) => {
    try {
      if(!terminalEl) return; // nothing to do

      // lines container: prefer an explicit container if present, otherwise use terminalEl as read-only target
      let lines = $id('terminal-lines') || terminalEl;

      // wrapper for overlays
      const termWrap = document.querySelector('.term-wrap') || terminalEl.parentElement || document.body;

      // defensive: do not touch terminalEl.innerHTML or children
      // create scroll button if missing
      let scrollBtn = $id('scroll-bottom-btn');
      if(!scrollBtn){
        try {
          scrollBtn = document.createElement('button');
          scrollBtn.id = 'scroll-bottom-btn';
          scrollBtn.setAttribute('aria-label','Scroll to latest output');
          scrollBtn.type = 'button';
          scrollBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
          // append safely
          termWrap.appendChild(scrollBtn);
        } catch(e){}
      }

      // utilities
      const atBottom = (el) => (el.scrollHeight - el.clientHeight - el.scrollTop) <= 8;
      const atTop = (el) => el.scrollTop <= 8;

      function updateUI(){
        try {
          const top = atTop(terminalEl);
          const bottom = atBottom(terminalEl);
          if(scrollBtn) scrollBtn.classList.toggle('show', !bottom);
          if(termWrap){
            termWrap.classList.toggle('has-scroll', !top || !bottom);
            termWrap.classList.toggle('has-scroll-top', !top);
            termWrap.classList.toggle('has-scroll-bottom', !bottom);
          }
        } catch(e){}
      }

      terminalEl.addEventListener('scroll', () => {
        try {
          updateUI();
        } catch(e){}
      }, { passive: true });

      if(scrollBtn){
        scrollBtn.addEventListener('click', () => {
          try {
            terminalEl.scrollTo({ top: terminalEl.scrollHeight, behavior: 'smooth' });
            setTimeout(focusPromptCaret, 220);
          } catch(e){}
        });
      }

      // keyboard navigation (non-invasive)
      document.addEventListener('keydown', (ev) => {
        try {
          const active = document.activeElement;
          if(active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
          if(ev.key === 'PageUp'){ terminalEl.scrollBy({ top: -terminalEl.clientHeight*0.9, behavior: 'smooth' }); ev.preventDefault(); }
          else if(ev.key === 'PageDown'){ terminalEl.scrollBy({ top: terminalEl.clientHeight*0.9, behavior: 'smooth' }); ev.preventDefault(); }
          else if(ev.key === 'Home'){ terminalEl.scrollTo({ top: 0, behavior: 'smooth' }); ev.preventDefault(); }
          else if(ev.key === 'End'){ terminalEl.scrollTo({ top: terminalEl.scrollHeight, behavior: 'smooth' }); ev.preventDefault(); }
          else if(ev.ctrlKey && ev.key === 'ArrowUp'){ terminalEl.scrollBy({ top: -140, behavior: 'smooth' }); ev.preventDefault(); }
          else if(ev.ctrlKey && ev.key === 'ArrowDown'){ terminalEl.scrollBy({ top: 140, behavior: 'smooth' }); ev.preventDefault(); }
        } catch(e){}
      });

      // mutation observer: auto-scroll only if user at bottom
      try {
        const obs = new MutationObserver(() => {
          try {
            if(atBottom(terminalEl)){
              terminalEl.scrollTo({ top: terminalEl.scrollHeight, behavior: 'smooth' });
            } else {
              updateUI();
            }
          } catch(e){}
        });
        obs.observe(lines, { childList: true, subtree: false });
      } catch(e){}

      // click wrapper focuses prompt
      try {
        termWrap.addEventListener('click', (e) => {
          try {
            const tag = (e.target && e.target.tagName || '').toLowerCase();
            if(['a','button','input','textarea','select'].includes(tag)) return;
            focusPromptCaret();
          } catch(e){}
        });
      } catch(e){}

      // initial update
      setTimeout(()=>{ try { updateUI(); terminalEl.scrollTo({ top: terminalEl.scrollHeight }); } catch(e){} }, 120);
      // expose API
      window.TerminalScroll = {
        scrollToBottom: function(){ try{ terminalEl.scrollTo({ top: terminalEl.scrollHeight, behavior: 'smooth' }); }catch(e){} },
        isAtBottom: function(){ try{ return atBottom(terminalEl); }catch(e){ return true; } },
        updateUI: updateUI
      };
    } catch(e){
      // safe fallback: don't break the page
      console.warn('terminal-scroll-safe init failed:', e);
    }
  }).catch(()=>{ /* ignore */ });
})();