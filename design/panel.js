const tabs = {overview:'概览', source:'来源', trigger:'触发', eval:'评估', execution:'执行', settings:'设置'};
const tickets = [
  {id:'1042',source:'企业微信',ref:'项目协作群',title:'补齐企业微信语音消息的转写回归用例',note:'需要确认是否将引用消息中的转写文本纳入本次测试。',state:'等待确认',time:'14:32',agent:'Codex'},
  {id:'1041',source:'Forgejo',ref:'Issue #218',title:'修复 PR 关闭后仍显示执行中的状态',note:'修复已推送，等待维护者确认是否重新运行集成测试。',state:'等待确认',time:'13:56',agent:'Claude Code'},
  {id:'1040',source:'Forgejo',ref:'Issue #215',title:'为 Worker 补充断线恢复测试',note:'执行 Agent 正在运行恢复场景的集成测试。',state:'执行中',time:'11:24',agent:'Codex'}
];
const content = document.querySelector('#content');
const escapeHTML = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const link = (url,label,cls='link') => '<a class="'+cls+'" href="#'+url+'">'+label+'</a>';
function section(title,body,action='',count='') {
  return '<section><div class="heading"><h2>'+title+' <b>'+count+'</b></h2>'+action+'</div>'+body+'</section>';
}
function card(t) {
  return '<a class="card" href="#ticket/'+t.id+'"><div class="rowtop"><div class="meta"><span class="code">T-'+t.id+'</span> · '+t.source+' / '+t.ref+'</div><span class="tag '+(t.state==='执行中'?'live':'')+'">'+t.state+'</span></div><h3>'+t.title+'</h3><p>'+t.note+'</p></a>';
}
const cards = rows => '<div class="cards">'+rows.map(card).join('')+'</div>';
const stats = items => '<div class="box stats '+(items.length===3?'three':'')+'">'+items.map(([name,value])=>'<div><small>'+name+'</small><strong>'+value+'</strong></div>').join('')+'</div>';
function overview() {
  const pending=tickets.filter(t=>t.state==='等待确认');
  const rows=list=>'<div class="worklist">'+list.map(t=>'<a href="#ticket/'+t.id+'"><span class="status-dot '+(t.state==='执行中'?'running':'')+'"></span><span><b>'+t.title+'</b><small>T-'+t.id+' · '+t.source+' / '+t.ref+'</small></span><time>'+t.time+'</time></a>').join('')+'</div>';
  return section('待处理工单',rows(pending),'',pending.length)+
    section('执行中',rows(tickets.filter(t=>t.state==='执行中')),link('execution','全部工单 ›'),1)+
    '<div class="digest">'+link('trigger','<strong>最近 24 小时</strong><span>到达 8　过滤 2　评估 6　接受 3</span> ›','digest-row')+
    link('execution','<strong>执行器</strong><span>占用 1 / 4　排队 0</span> ›','digest-row')+'</div><p class="sample">superagent-dev · 示例数据</p>';
}
function row(title,hint,right,url) {
  const body='<span>'+title+'<small>'+hint+'</small></span><span>'+right+'</span>';
  return url?'<a class="item" href="#'+url+'">'+body+'</a>':'<div class="item">'+body+'</div>';
}
const box = body => '<div class="box">'+body+'</div>';
const back = (url,label) => link(url,'‹ '+label,'back link');
function ticket(t) {
  return back('execution','执行')+section('工单 T-'+t.id,box('<div class="meta">'+t.source+' / '+t.ref+'</div><h2>'+t.title+'</h2><span class="tag">'+t.state+'</span><p class="detail">'+t.note+'</p>'))+
    section('执行记录',box(row('Router 接受请求','已从来源消息创建工单',t.time)+row('已委派给 '+t.agent,'Paseo 执行 Agent','打开 ›','agent/'+t.id)+row(t.state,t.note,'')))+
    link('chat','联系 Router','btn');
}
function render() {
  const [page='overview',arg='']=(location.hash.slice(1)||'overview').split('/');
  document.body.classList.toggle('in-session',page==='chat');
  if(page!=='chat') sessionUI.returnTo=location.hash||'#overview';
  const active=['ticket','agent'].includes(page)?'execution':page;
  document.querySelector('#tabs').innerHTML=Object.entries(tabs).map(([key,name])=>'<a '+(key===active?'aria-current="page"':'')+' href="#'+key+'">'+name+'</a>').join('');
  const t=tickets.find(x=>x.id===arg);
  switch(page) {
    case 'source':
      content.innerHTML=section('来源',box(['企业微信','Forgejo'].map(s=>row(s,s==='企业微信'?'项目协作群 · 长连接':'team/superagent · Issue、PR 和评论','查看消息 ›','trigger/'+encodeURIComponent(s))).join('')));break;
    case 'trigger':
    case 'eval': {
      const filtered=tickets.filter(x=>!arg||x.source===decodeURIComponent(arg));
      content.innerHTML=section(page==='eval'?'最近接受的请求':'最近触发工单的消息',box(filtered.map(x=>row(x.title,x.source+' / '+x.ref,(page==='eval'?'已接受':'T-'+x.id)+' ›','ticket/'+x.id)).join('')),arg?link('trigger','全部来源'):'',filtered.length);break;
    }
    case 'execution': content.innerHTML=section('进行中的工单',cards(tickets),'',tickets.length);break;
    case 'settings': content.innerHTML=section('部署',box(row('实例','Superagent profile','superagent-dev')+row('连接方式','通过当前 Paseo host 访问 DSH','本机 daemon')))+section('执行',box(row('最大并发 Worker','执行器槽位','4')+row('委派方式','按工单绑定执行 Agent','Paseo')));break;
    case 'ticket': content.innerHTML=t?ticket(t):overview();break;
    case 'agent': content.innerHTML=t?back('ticket/'+t.id,'工单 T-'+t.id)+section(t.agent+' · 执行会话',box('<small>执行记录预览</small><h2>'+t.title+'</h2><p>'+t.note+'</p>')):overview();break;
    case 'chat': sessionUI.mount(content);break;
    case 'search': {
      const q=decodeURIComponent(arg).toLowerCase();
      const found=tickets.filter(x=>Object.values(x).join(' ').toLowerCase().includes(q)||('t-'+x.id).includes(q));
      content.innerHTML=section('工单搜索',found.length?cards(found):box('没有匹配的工单'),back('overview','概览'),found.length);break;
    }
    default:content.innerHTML=overview();
  }
  document.querySelector('#side').classList.remove('open');
  window.scrollTo(0,0);
}
document.querySelector('#search').onsubmit=e=>{
  e.preventDefault();const q=e.target.querySelector('input').value.trim();if(q)location.hash='search/'+encodeURIComponent(q);
};
document.querySelector('#menu').onclick=()=>document.querySelector('#side').classList.toggle('open');
document.querySelector('.selected').onclick=()=>document.querySelector('#side').classList.remove('open');
document.querySelector('#find').onclick=()=>{
  const form=document.querySelector('#search');
  form.hidden=!form.hidden;
  if(!form.hidden)form.querySelector('input').focus();
};
window.addEventListener('hashchange',render);render();
