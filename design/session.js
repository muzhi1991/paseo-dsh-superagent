// Local interaction model for the design preview. Attachments stay in this tab.
const sessionUI = (() => {
  const icons = {
    back:'<path d="m14 5-7 7 7 7"/>',
    file:'<path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    send:'<path d="M12 19V5m-6 6 6-6 6 6"/>'
  };
  const icon = k=>'<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+icons[k]+'</svg>';
  const turns=[{question:'看一下企业微信的语音转写任务，执行到哪了？',files:[],time:'14:36',steps:['收到执行请求','读取工单 T-1042','检查 Worker 最新报告'],answer:'Worker 已补齐普通语音消息的转写用例。现在需要你确认：引用消息里的语音转写，也要算进这次回归吗？',seconds:6,ticket:'1042'}];
  const models=['DeepSeek V4 Pro','DeepSeek V4 Flash'];
  let effort='默认';
  let model=models[0], draft='',files=[],busy=false;
  const ticketLink=id=>'<a class="ticket-ref" href="#ticket/'+id+'">T-'+id+'　查看工单 ›</a>';
  const chips=items=>items.map(f=>'<span class="file-chip">'+(f.preview?'<img src="'+f.preview+'" alt="">':icon('file'))+escapeHTML(f.name)+'</span>').join('');
  function turnMarkup(t) {
    return '<article class="turn"><div class="human"><div>'+chips(t.files)+'</div>'+escapeHTML(t.question)+'</div><div class="turn-head"><b class="router-icon">R</b><strong>Router</strong><time>'+t.time+'</time></div>'+
      '<details class="trace"><summary>收到执行请求 <small>· '+t.steps.length+' 步</small></summary><ol>'+t.steps.map(x=>'<li>'+escapeHTML(x)+'</li>').join('')+'</ol></details>'+
      (t.stopped?'<div class="receipt">已停止本轮回复</div>':t.answer?'<p class="reply">'+escapeHTML(t.answer)+'</p>'+(t.ticket?ticketLink(t.ticket):'')+'<div class="receipt"><span>✓</span> 已完成，用时 '+t.seconds+' 秒</div>':'<div class="receipt">'+escapeHTML(t.steps.at(-1))+'…</div>')+'</article>';
  }
  function updateLog(scroll) {
    const log=document.querySelector('.journal');
    if(!log)return;
    log.innerHTML=turns.map(turnMarkup).join('');
    if(scroll)log.scrollTop=log.scrollHeight;
  }
  function refreshComposer(){
    const form=document.querySelector('.dock');
    if(!form)return;
    form.querySelector('.staged').innerHTML=files.map((f,i)=>'<button type="button" data-remove="'+i+'" aria-label="移除 '+escapeHTML(f.name)+'">'+chips([f])+' ×</button>').join('');
    const send=form.querySelector('.send');
    send.disabled=!busy&&!draft.trim()&&!files.length;
    send.setAttribute('aria-label',busy?'停止本轮回复':'发送');
    send.title=send.getAttribute('aria-label');
    send.innerHTML=busy?'■':icon('send');
  }
  async function submit(e){
    e.preventDefault();
    if(busy){
      turns.at(-1).stopped=true;
      busy=false;updateLog(true);refreshComposer();return;
    }
    if(!draft.trim()&&!files.length)return;
    const t={question:draft.trim(),files,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),steps:['收到执行请求']};
    const match=tickets.find(x=>t.question.includes(x.id));
    const start=performance.now();
    turns.push(t);files=[];draft='';busy=true;e.target.elements.message.value='';
    updateLog(true);refreshComposer();
    await new Promise(resolve=>setTimeout(resolve,500));
    if(t.stopped)return;
    t.steps.push(match?'读取工单 T-'+match.id:'读取本轮输入');updateLog(true);
    await new Promise(resolve=>setTimeout(resolve,650));
    if(t.stopped)return;
    t.answer=match?match.note:t.files.length?'本轮已附上 '+t.files.length+' 个附件。设计预览仅展示附件和执行过程。':'当前有两张工单等待确认。输入 T-1042 或 T-1041 可以查看具体进展。';
    t.ticket=match?.id;t.seconds=Math.round((performance.now()-start)/1000);busy=false;updateLog(true);refreshComposer();
  }
  const api={returnTo:'#overview',mount(root){
    root.innerHTML='<div class="session-page"><header class="session-head"><a href="'+escapeHTML(api.returnTo)+'" aria-label="返回上一页">'+icon('back')+'</a><div><strong>主 Session</strong><small>Router · superagent-dev</small></div><span class="demo">设计预览</span></header><div class="journal" role="log"></div><form class="dock"><div class="staged"></div><textarea name="message" rows="2" aria-label="消息内容" placeholder="给 Router 发送消息…"></textarea><div class="dock-tools"><button type="button" class="attach" title="添加文件" aria-label="添加文件">'+icon('file')+'</button><button type="button" class="model-choice"></button><div class="model-pop" hidden><label>会话模型<select aria-label="选择示例模型">'+models.map(m=>'<option>'+m+'</option>').join('')+'</select></label><label>推理强度<select aria-label="选择示例推理强度"><option>默认</option><option>高</option></select></label></div><button class="send" title="发送" aria-label="发送">'+icon('send')+'</button></div><input hidden multiple type="file" id="file"></form></div>';
    const form=root.querySelector('.dock');form.onsubmit=submit;
    const settings=form.querySelector('.model-pop'), modelButton=form.querySelector('.model-choice');
    function showModel(open){
      settings.hidden=!open;
      modelButton.setAttribute('aria-expanded',String(open));
    }
    const [modelSelect,effortSelect]=settings.querySelectorAll('select');
    modelSelect.value=model;effortSelect.value=effort;
    function updateModel(){
      model=modelSelect.value;effort=effortSelect.value;
      modelButton.textContent=model+' · '+effort+' ▾';
    }
    settings.onchange=updateModel;updateModel();showModel(false);
    form.onkeydown=e=>{if(e.key==='Escape'){showModel(false);form.elements.message.focus()}};
    form.closest('.session-page').onclick=e=>{if(!e.target.closest('.dock-tools'))showModel(false)};
    form.elements.message.value=draft;
    form.elements.message.oninput=e=>{draft=e.target.value;refreshComposer()};
    form.onclick=e=>{
      const target=e.target.closest('button');if(!target)return;
      if(target===modelButton)showModel(settings.hidden);
      if(target.classList.contains('attach')){
        showModel(false);
        form.querySelector('#file').click();
      }
      if(target.hasAttribute('data-remove')){const [removed]=files.splice(Number(target.dataset.remove),1);if(removed.preview)URL.revokeObjectURL(removed.preview);refreshComposer()}
    };
    for(const input of form.querySelectorAll('input[type=file]'))input.onchange=()=>{
      files.push(...Array.from(input.files,f=>({name:f.name,preview:f.type.startsWith('image/')?URL.createObjectURL(f):''})));input.value='';refreshComposer();
    };
    updateLog(true);refreshComposer();
  }};
  return api;
})();
