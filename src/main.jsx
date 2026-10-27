import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, LogOut, UserRound, Heart, MessageCircle, ShieldCheck, Palette, ChevronLeft, Video, Phone, MonitorUp, MicOff, VideoOff, PhoneOff, X, Send, Check, Trash2, LockKeyhole, RefreshCw } from 'lucide-react';
import { supabase, configured, avatarUrl, errorText } from './supabase';
import CATALOG from './catalog.json';
import ABILITIES from './abilities.json';
import './legacy.css';
import './modern.css';

const THEMES = ['night','light','neon','sunset','ocean','forest','cyberpunk','aurora','sakura','coffee','midnight','crimson','lavender','ember','glacier','royal','obsidian','mint','pearl','synthwave','cherry','sand','matrix','cosmos','graphite','lagoon','paper','candy','ultramarine','terracotta'];
const GAME_ICONS = {doors:'🚪', dandy:'🌸', blox:'🍇', jujutsu:'⚡', azure:'⚽'};
const SHOW_GAMES = [
  {key:'doors',title:'DOORS',summary:'Предметы, монстры и тактики выживания',type:'survival',gradient:'linear-gradient(135deg,#250b16,#0b0618)'},
  {key:'dandy',title:"Dandy’s World",summary:'Рейтинги персонажей',type:'survival',gradient:'linear-gradient(135deg,#4c143a,#1c0b35)'},
  {key:'blox',title:'Blox Fruits',summary:'PvP, прокачка и торговля',type:'pvp',gradient:'linear-gradient(135deg,#163e86,#1b0a45)'},
  {key:'jujutsu',title:'Jujutsu Shenanigans',summary:'Персонажи и техники',type:'pvp',gradient:'linear-gradient(135deg,#342061,#160925)'},
  {key:'azure',title:'Azure Latch',summary:'Футбольные стили и эволюции',type:'sport',gradient:'linear-gradient(135deg,#063d68,#08162c)'}
];
const GAME_IMAGES = { doors:'https://tr.rbxcdn.com/180DAY-6d72472d3b2a47c5441194c8cf9f002c/256/256/Image/Webp/noFilter', dandy:'https://tr.rbxcdn.com/180DAY-888663d5087991ea655a35df6a515ac5/256/256/Image/Webp/noFilter',blox:'https://tr.rbxcdn.com/180DAY-774ec14539b264f85fdb6e8a34dfa344/256/256/Image/Webp/noFilter', jujutsu:'https://tr.rbxcdn.com/180DAY-d050b3c50d30c76d215accd60ddbb1c5/256/256/Image/Webp/noFilter', azure:'https://static.wikia.nocookie.net/azure-latch/images/0/03/MKaiserLogo.webp/revision/latest/scale-to-width-down/190?cb=20260824032735' };
const cleanUsername = value => /^[A-Za-z0-9_]{3,24}$/.test(value.trim());
function dateText(v) { try { return new Date(v).toLocaleString('ru-RU'); } catch { return '—'; } }
function useNotice() { const [notice,setNotice] = useState(''); return [notice, (v) => setNotice(String(v))]; }
function Portrait({profile,size=42}) {const url=avatarUrl(profile?.avatar_path);return <span className="user-portrait" style={{width:size,height:size,fontSize:size*.4}}>{url?<img src={url} alt=""/>:(profile?.username||'?')[0].toUpperCase()}</span>;}
function Notice({value}) {return value?<p className="notice" role="status">{value}</p>:null;}
function App() {
  const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[boot,setBoot]=useState(true);
  const [notice,notify]=useNotice(),[page,setPage]=useState('home');
  const [activeGame,setActiveGame]=useState('doors'),[mode,setMode]=useState('main');
  const [chosen,setChosen]=useState(null),[theme,setTheme]=useState(()=>{try{return THEMES.includes(localStorage.getItem('theme'))?localStorage.getItem('theme'):'night'}catch{return 'night'}});
  const [filter,setFilter]=useState('all'),[query,setQuery]=useState(''),[favs,setFavs]=useState([]);
  const [friendships,setFriendships]=useState([]),[friendProfiles,setFriendProfiles]=useState({});
  const [chatId,setChatId]=useState(null),[messages,setMessages]=useState([]),[chatText,setChatText]=useState('');
  const [friendsSearch,setFriendsSearch]=useState(''),[foundFriend,setFoundFriend]=useState(null);
  const [adminUsers,setAdminUsers]=useState([]),[adminSearch,setAdminSearch]=useState('');
  const [busy,setBusy]=useState(false);
  const callRef=useRef(null),messagesEndRef=useRef(null);
  const userId=session?.user?.id;
  const active = Boolean(profile && (!profile.banned_until || Date.parse(profile.banned_until)<=Date.now()));

  useEffect(()=>{document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=['light','mint','pearl','sand','paper','candy','terracotta'].includes(theme)?'light':'dark';try{localStorage.setItem('theme',theme)}catch{}},[theme]);
  useEffect(()=>{
    if(!supabase){setBoot(false);return;}
    let live=true;
    supabase.auth.getSession().then(({data})=>{if(live){setSession(data.session);setBoot(false)}}).catch(()=>setBoot(false));
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_evt,current)=>{if(live){setSession(current);if(!current){setProfile(null);setChosen(null);setPage('home')}}});
    return()=>{live=false;subscription.unsubscribe()};
  },[]);
  async function reloadProfile() {
    if(!userId)return;
    const {data,error}=await supabase.from('profiles').select('*').eq('id',userId).single();
    if(error)notify(errorText(error));else setProfile(data);
  }
  useEffect(()=>{if(userId){reloadProfile()}else{setProfile(null);setFavs([]);setFriendships([])}},[userId]);
  async function loadFavorites(){if(!userId)return;const {data,error}=await supabase.from('favorites').select('card_id').eq('user_id',userId);if(!error)setFavs((data||[]).map(x=>x.card_id));}
  useEffect(()=>{if(userId && active)loadFavorites()},[userId,active]);
  async function toggleFavorite(id){
    if(!active)return;
    const has=favs.includes(id);
    setFavs(curr=>has?curr.filter(x=>x!==id):[...curr,id]);
    const result=has?await supabase.from('favorites').delete().eq('card_id',id).eq('user_id',userId):await supabase.from('favorites').insert({card_id:id,user_id:userId});
    if(result.error){loadFavorites();notify(errorText(result.error));}
  }
  async function loadFriends(){
    if(!userId)return;
    const {data,error}=await supabase.from('friendships').select('id,requester,recipient,status,created_at').or(`requester.eq.${userId},recipient.eq.${userId}`).order('created_at',{ascending:false}).limit(100);
    if(error)return notify(errorText(error));
    const people=[...new Set((data||[]).flatMap(f=>[f.requester,f.recipient]))];
    const {data:profiles}=people.length?await supabase.from('profiles').select('id,username,avatar_path,role').in('id',people):{data:[]};
    setFriendships(data||[]);setFriendProfiles(Object.fromEntries((profiles||[]).map(p=>[p.id,p])));
  }
  useEffect(()=>{
    if(!userId||!active)return;
    loadFriends();
    const channel=supabase.channel(`friendships:${userId}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'friendships',filter:`requester=eq.${userId}`},loadFriends)
      .on('postgres_changes',{event:'*',schema:'public',table:'friendships',filter:`recipient=eq.${userId}`},loadFriends).subscribe();
    return()=>{supabase.removeChannel(channel)};
  },[userId,active]);
  async function searchUser(){
    const username=friendsSearch.trim();setFoundFriend(null);
    if(!cleanUsername(username))return notify('Введите ник: 3–24 символа, латиница, цифры или _.');
    const {data,error}=await supabase.rpc('find_user_by_username',{search_name:username});
    if(error)notify(errorText(error));else setFoundFriend(data?.[0]||'none');
  }
  async function requestFriend(target){
    if(!target || target.id===userId)return;
    const {error}=await supabase.from('friendships').insert({requester:userId,recipient:target.id});
    if(error)notify(errorText(error));else{notify('Запрос отправлен.');setFoundFriend(null);loadFriends();}
  }
  async function acceptFriend(id){const {error}=await supabase.rpc('accept_friendship',{fid:id});if(error)notify(errorText(error));else loadFriends();}
  async function removeFriend(id){if(!confirm('Удалить запрос или дружбу?'))return;const {error}=await supabase.from('friendships').delete().eq('id',id);if(error)notify(errorText(error));else{if(id===chatId)setChatId(null);loadFriends();}}
  async function loadMessages(fid){
    if(!fid)return;const {data,error}=await supabase.from('messages').select('id,body,created_at,sender_id').eq('friendship_id',fid).order('created_at',{ascending:false}).limit(100);
    if(error)notify(errorText(error));else setMessages((data||[]).reverse());
  }
  useEffect(()=>{
    if(!chatId||!active)return;
    setMessages([]);loadMessages(chatId);
    const channel=supabase.channel(`chat-feed:${chatId}`).on('postgres_changes',{event:'INSERT',schema:'public',table:'messages',filter:`friendship_id=eq.${chatId}`},()=>loadMessages(chatId)).subscribe();
    return()=>{supabase.removeChannel(channel)};
  },[chatId,active]);
  useEffect(()=>messagesEndRef.current?.scrollIntoView({behavior:'smooth',block:'end'}),[messages]);
  async function sendMessage(evt){
    evt?.preventDefault();const text=chatText.trim();if(!text||text.length>500||!chatId)return;
    setChatText('');const {error}=await supabase.from('messages').insert({friendship_id:chatId,body:text});
    if(error){setChatText(text);notify(errorText(error))}else loadMessages(chatId);
  }
  function openGame(key){setActiveGame(key);setMode('main');setChosen(null);setPage('game');window.scrollTo({top:0,behavior:'smooth'});}
  const sections=CATALOG.games.filter(g=>g.game===activeGame);
  const currentSection=sections.find(g=>g.modes.some(m=>m.key===mode))||sections[0];
  const gameView=activeGame==='blox'?currentSection:currentSection;
  const currentMode=gameView?.modes.find(m=>m.key===mode)||gameView?.modes[0];
  const favSet=useMemo(()=>new Set(favs),[favs]);
  const accepted=friendships.filter(f=>f.status==='accepted');
  const pending=friendships.filter(f=>f.status==='pending');
  const selectedChat=accepted.find(f=>f.id===chatId);
  const selectedOther=selectedChat?friendProfiles[selectedChat.requester===userId?selectedChat.recipient:selectedChat.requester]:null;
  async function loadAdmins(){const {data,error}=await supabase.rpc('admin_list_users');if(error)notify(errorText(error));else setAdminUsers(data||[]);}
  useEffect(()=>{if(page==='admin'&&['admin','boss'].includes(profile?.role))loadAdmins();},[page,profile?.role]);
  async function adminAction(u,operation){
    const labels={ban:'Заблокировать',unban:'Разблокировать',promote:'Назначить администратором',demote:'Снять администратора'};
    if(!confirm(`${labels[operation]} пользователя ${u.username}?`))return;
    const {error}=await supabase.rpc('admin_manage_user',{target:u.id,operation,duration_seconds:operation==='ban'?86400:null});
    if(error)notify(errorText(error));else loadAdmins();
  }
  async function signOut(){await supabase.auth.signOut();setPage('home');setChatId(null);}
  if(boot)return <div className="splash-stage">🎮 Загрузка Roblox Tier List…</div>;
  if(!configured)return <div className="config-screen"><h2>Требуется настройка Supabase</h2><p>Создайте <code>.env</code> по примеру <code>.env.example</code>, выполните SQL-миграцию и запустите сайт.</p></div>;
  if(!session)return <Auth/>;
  if(!profile)return <div className="splash-stage">Загружаем профиль… <button className="collection-button" onClick={reloadProfile}>Повторить</button> <button className="collection-button" onClick={signOut}>Выйти</button></div>;
  if(!active)return <div className="config-screen"><h2>Учётная запись заблокирована</h2><p>Ограничение до: {dateText(profile.banned_until)}</p><button className="collection-button" onClick={signOut}>Выйти</button></div>;
  return <>
    <div className="bg-anim"><div className="bg-blob bg-blob--1"/><div className="bg-blob bg-blob--2"/><div className="bg-blob bg-blob--3"/></div><div className="bg-grid"/>
    <header className="topbar"><button className="topbar__logo brand-button" onClick={()=>setPage('home')}><span className="emoji">🎮</span><span>Universal Roblox <b>Tier List</b></span></button>
      <nav className="nav-links"><button onClick={()=>setPage('home')}>Каталог</button><button onClick={()=>setPage('favorites')}><Heart size={16}/> Избранное <span>{favs.length}</span></button><button onClick={()=>setPage('social')}><MessageCircle size={16}/> Друзья</button>{['admin','boss'].includes(profile.role)&&<button onClick={()=>setPage('admin')}><ShieldCheck size={16}/> Админка</button>}</nav>
      <button className="profile-link" onClick={()=>setPage('profile')}><Portrait profile={profile} size={35}/><b>{profile.username}</b></button><button className="icon-button" onClick={signOut} title="Выход"><LogOut size={18}/></button>
    </header>
    <main className="layout app-layout">
      <Notice value={notice}/>
      {page==='home'&&<>
        <div className="hub-hero"><section className="hub-hero-copy"><p className="hub-eyebrow">ROBLOX COLLECTION · ЗАЩИЩЁННАЯ ВЕРСИЯ</p><p className="hub-welcome">С возвращением, {profile.username}</p><h1>Твоя игра.<br/><span>Твой следующий топ.</span></h1><p className="hub-intro">Изучай карточки из пяти игр, собирай коллекцию и общайся с друзьями — с сохранением в облаке.</p><div className="hub-metrics"><span><b>5</b> миров</span><span><b>530</b> карточек</span><span><b>{favs.length}</b> в избранном</span></div></section><div className="hub-studio"><div className="studio-orbit" aria-hidden="true"><span/><span/><i>✦</i></div><p className="hub-eyebrow">ТВОЯ АТМОСФЕРА</p><h2>Настрой оформление</h2><p>30 тем оформления с сохранением выбора на устройстве.</p><ThemeGrid theme={theme} onChange={setTheme} compact/></div></div>
        <form className="hub-search" onSubmit={e=>{e.preventDefault();const name=query.trim().toLowerCase();const match=Object.values(CATALOG.items).find(i=>i.name.toLowerCase().includes(name));if(name&&match){openGame(match.game);setChosen(match)}else notify('Карточка не найдена.')}}><Search size={20}/><input aria-label="Поиск предмета" placeholder="Найти предмет, персонажа или игру…" value={query} onChange={e=>setQuery(e.target.value)} /><button className="collection-button" type="submit">Найти</button></form>
        <div className="hub-toolbar"><h2>Каталог игр</h2><span className="hub-game-count">5 игр</span></div>
        <div className="hub-filters">{[['all','Все'],['pvp','PvP'],['survival','Выживание'],['sport','Спорт']].map(([key,label])=><button key={key} aria-pressed={filter===key} onClick={()=>setFilter(key)}>{label}</button>)}</div>
        <div className="home-cards">{SHOW_GAMES.filter(g=>filter==='all'||g.type===filter).map(g=><button className="home-card" key={g.key} style={{background:g.gradient}} onClick={()=>openGame(g.key)}><img className="home-card__art" src={GAME_IMAGES[g.key]} alt="" loading="lazy"/><span className="home-card__shade"/><span className="home-card__content"><span className="home-card__title">{g.title}</span><span className="home-card__desc">{g.summary}</span><span className="home-card__btn">Открыть каталог</span></span></button>)}</div>
      </>}
      {page==='game'&&<>
        <button className="btn-secondary" onClick={()=>setPage('home')}><ChevronLeft size={16}/> На главную</button>
        <div className="game-heading"><span>{GAME_ICONS[activeGame]}</span><div><h1>{SHOW_GAMES.find(g=>g.key===activeGame)?.title}</h1><p>Нажми на карточку, чтобы посмотреть характеристики</p></div></div>
        {activeGame==='doors'&&<div className="blox-tabs">{sections.map(g=><button className="blox-tab" key={g.key} aria-selected={currentSection?.key===g.key} onClick={()=>{setMode('main');setActiveGame('doors');setChosen(null);const el=document.getElementById('section-'+g.key);el?.scrollIntoView({behavior:'smooth'})}}>{g.subtitle}</button>)}</div>}
        {(activeGame==='doors'?sections:[currentSection]).map(section=><section className="game-card" key={section.key} id={'section-'+section.key}>
          {activeGame==='doors'&&<h2>{section.subtitle}</h2>}
          {section.modes.length>1&&<div className="blox-tabs">{section.modes.map(m=><button className="blox-tab" key={m.key} aria-selected={currentMode?.key===m.key} onClick={()=>setMode(m.key)}>{m.label}</button>)}</div>}
          {(section.modes.length>1?(section.modes.find(m=>m.key===mode)||section.modes[0]):section.modes[0])?.groups.map((group,index)=><div key={index} className="catalog-group"><h3 className="jujutsu-group">{group.name}</h3>{group.rows.map((row,idx)=><div className="tier-row" key={idx}><div className={`tier-label ${['S','A','B','C','D','F'].includes(row.tier)?row.tier:'unranked'}`}>{row.tier}</div><div className="tier-items">{row.items.map(id=><ItemCard key={id} item={CATALOG.items[id]} liked={favSet.has(id)} onLike={()=>toggleFavorite(id)} onOpen={()=>setChosen(CATALOG.items[id])}/>)}</div></div>)}</div>)}
        </section>)}
      </>}
      {page==='favorites'&&<><div className="section-heading"><h1>⭐ Избранное</h1><p>Карточки синхронизируются между твоими устройствами.</p></div><div className="collection-grid">{favs.map(id=>CATALOG.items[id]&&<ItemCard key={id} item={CATALOG.items[id]} liked onLike={()=>toggleFavorite(id)} onOpen={()=>setChosen(CATALOG.items[id])}/>)}</div>{!favs.length&&<p className="collection-empty">Добавь карточки, нажав на сердечко в каталоге.</p>}</>}
      {page==='profile'&&<ProfileEditor profile={profile} reload={reloadProfile} notify={notify} theme={theme} setTheme={setTheme}/>}
      {page==='social'&&<>
        <div className="section-heading"><h1>💬 Друзья и сообщения</h1><p>Личные сообщения доступны только двум участникам принятой дружбы.</p></div>
        <div className="social-layout"><aside className="social-sidebar"><h3>Найти друга</h3><form className="social-find" onSubmit={e=>{e.preventDefault();searchUser()}}><input placeholder="Точный ник…" value={friendsSearch} onChange={e=>setFriendsSearch(e.target.value)} maxLength={24}/><button className="collection-button"><Search size={16}/></button></form>
          {foundFriend==='none'&&<p className="small-muted">Ник не найден.</p>}
          {foundFriend&&foundFriend!=='none'&&<div className="friend-row"><Portrait profile={foundFriend} size={32}/><b>{foundFriend.username}</b><button className="collection-button" onClick={()=>requestFriend(foundFriend)}>+</button></div>}
          <h3>Запросы ({pending.length})</h3>{pending.map(f=><div className="friend-row" key={f.id}><Portrait profile={friendProfiles[f.requester===userId?f.recipient:f.requester]} size={32}/><span className="friend-name">{friendProfiles[f.requester===userId?f.recipient:f.requester]?.username||'Пользователь'}<small>{f.recipient===userId?'Входящий':'Отправлен'}</small></span>{f.recipient===userId&&<button title="Принять" onClick={()=>acceptFriend(f.id)}><Check size={15}/></button>}<button title="Удалить" onClick={()=>removeFriend(f.id)}><X size={15}/></button></div>)}
          <h3>Друзья ({accepted.length})</h3>{accepted.map(f=>{const other=friendProfiles[f.requester===userId?f.recipient:f.requester];return <div key={f.id} className={'friend-row '+(chatId===f.id?'active':'')}><button className="friend-select" onClick={()=>setChatId(f.id)}><Portrait profile={other} size={34}/><span>{other?.username||'Друг'}</span></button><button title="Удалить друга" onClick={()=>removeFriend(f.id)}><Trash2 size={15}/></button></div>})}
        </aside><section className="social-conversation">{selectedChat?<><header className="conversation-head"><Portrait profile={selectedOther} size={38}/><div><b>{selectedOther?.username}</b><small>Личный чат</small></div><div className="grow"/><button className="icon-button" title="Аудиозвонок" onClick={()=>callRef.current?.start(selectedChat,false)}><Phone size={19}/></button><button className="icon-button" title="Видеозвонок" onClick={()=>callRef.current?.start(selectedChat,true)}><Video size={19}/></button></header><div className="message-scroll">{messages.map(m=><div key={m.id} className={'message '+(m.sender_id===userId?'mine':'')}><div className="message-bubble">{m.body}<small>{dateText(m.created_at)}</small></div></div>)}<div ref={messagesEndRef}/></div><form className="message-input" onSubmit={sendMessage}><input placeholder="Сообщение до 500 символов…" maxLength={500} value={chatText} onChange={e=>setChatText(e.target.value)}/><button className="btn-primary" disabled={!chatText.trim()} aria-label="Отправить"><Send size={18}/></button></form></>:<div className="conversation-empty"><MessageCircle size={44}/><h2>Выбери друга</h2><p>Для общения сначала отправь запрос и дождись принятия.</p></div>}</section></div>
      </>}
      {page==='admin'&&['admin','boss'].includes(profile.role)&&<><div className="section-heading"><h1><ShieldCheck/> Панель управления</h1><p>Доступ проверяется внутри базы PostgreSQL. Операции фиксируются в журнале.</p></div><form className="hub-search" onSubmit={e=>e.preventDefault()}><Search size={18}/><input placeholder="Ник…" value={adminSearch} onChange={e=>setAdminSearch(e.target.value)}/><button type="button" className="collection-button" onClick={loadAdmins}><RefreshCw size={16}/></button></form><div className="admin-table-scroll"><table className="admin-user-table"><thead><tr><th>Ник</th><th>Роль</th><th>Регистрация</th><th>Блокировка</th><th>Управление</th></tr></thead><tbody>{adminUsers.filter(u=>u.username.toLowerCase().includes(adminSearch.toLowerCase())).map(u=><tr key={u.id}><td><b>{u.username}</b></td><td>{u.role}</td><td>{dateText(u.created_at)}</td><td>{u.banned_until?dateText(u.banned_until):'Нет'}</td><td><div className="admin-actions"><button className="collection-button" disabled={u.id===userId||u.role==='boss'||(profile.role==='admin'&&u.role==='admin')} onClick={()=>adminAction(u,u.banned_until?'unban':'ban')}>{u.banned_until?'Разбанить':'Бан 24 ч.'}</button>{profile.role==='boss'&&u.role!=='boss'&&u.id!==userId&&<button className="collection-button" onClick={()=>adminAction(u,u.role==='admin'?'demote':'promote')}>{u.role==='admin'?'Снять админа':'Выдать админа'}</button>}</div></td></tr>)}</tbody></table></div></>}
    </main>
    <CallManager ref={callRef} friends={accepted} friendProfiles={friendProfiles} userId={userId} notify={notify}/>
    <button className="theme-fab" onClick={()=>setPage('profile')} title="Выбрать тему"><Palette size={23}/></button>
    {chosen&&<DetailModal item={chosen} liked={favSet.has(chosen.id)} onLike={()=>toggleFavorite(chosen.id)} onClose={()=>setChosen(null)}/>}
  </>;
}

function ItemCard({item,liked,onLike,onOpen}){return <div className="collection-entry"><button className="item" onClick={onOpen} title={item.name}>{item.image?<img loading="lazy" referrerPolicy="no-referrer" src={item.image} alt="" onError={e=>{e.currentTarget.style.display='none'}}/>:<span className="item__icon">🎮</span>}<span className="item__name">{item.title}</span></button><div className="collection-card-actions"><button className={'collection-mini '+(liked?'is-active':'')} title={liked?'Убрать из избранного':'В избранное'} onClick={onLike}>{liked?'♥':'♡'}</button><span className="item-score">{item.tier==='—'?'?':item.tier}</span></div></div>}
function DetailModal({item,liked,onLike,onClose}){const d=item.details||{};return <div className="modal-backdrop" role="presentation" onMouseDown={e=>e.target===e.currentTarget&&onClose()}><section className="item-modal" role="dialog" aria-modal="true" aria-label={item.name}><button className="modal-close" onClick={onClose}><X size={20}/></button><div className="item-modal__head">{item.image&&<img className="item-modal__img" src={item.image} alt=""/>}<div><h2>{item.title}</h2><p className="small-muted">{item.game} · {item.group}</p><span className="item-modal__badge">Тир: {item.tier}</span></div></div><button className="collection-button" onClick={onLike}>{liked?'♥ Убрать из избранного':'♡ В избранное'}</button>{d.type&&<p className="detail-block"><b>Тип:</b> {d.type}</p>}{d.price&&<p className="detail-block"><b>Цена:</b> {d.price}</p>}{d.desc&&<p className="detail-block">{d.desc}</p>}{d.verdict&&<div className="item-modal__verdict">{d.verdict}</div>}{Array.isArray(d.pros)&&<div className="detail-block"><h3>Плюсы</h3><ul>{d.pros.map((p,i)=><li key={i}>{p}</li>)}</ul></div>}{Array.isArray(d.cons)&&<div className="detail-block"><h3>Минусы</h3><ul>{d.cons.map((p,i)=><li key={i}>{p}</li>)}</ul></div>}{(()=>{const alias=ABILITIES.aliases[item.name]||item.name;const guide=ABILITIES.guides[item.game+':'+alias]||ABILITIES.guides[item.game+':'+item.name];return guide?<div className="detail-block"><h3>Навыки и способности</h3>{Array.isArray(guide.skills)&&guide.skills.map((sk,i)=><div className="ability-card" key={i}><div className="ability-name"><kbd>{sk.key||'•'}</kbd><h4>{sk.text}</h4></div><p>{sk.effect}</p></div>)}{(guide.abilityNote||guide.note)&&<p>{guide.abilityNote||guide.note}</p>}</div>:null})()} {!Object.keys(d).length&&!ABILITIES.guides[item.game+':'+(ABILITIES.aliases[item.name]||item.name)]&&<p className="small-muted">Дополнительная информация об этой карточке в исходном файле отсутствует.</p>}</section></div>}
function ThemeGrid({theme,onChange,compact=false}) {const [expanded,setExpanded]=useState(false);return <div><button className="collection-button" type="button" onClick={()=>setExpanded(v=>!v)}><Palette size={16}/> {expanded?'Скрыть темы':'Выбрать тему'} · {theme}</button>{expanded&&<div className={'theme-chooser '+(compact?'compact':'')}>{THEMES.map(t=><button key={t} className="theme-choice" data-theme-value={t} aria-pressed={theme===t} onClick={()=>onChange(t)}>{t}</button>)}</div>}</div>}
function Auth(){const [tab,setTab]=useState('login'),[email,setEmail]=useState(''),[pass,setPass]=useState(''),[username,setUsername]=useState(''),[show,setShow]=useState(false),[busy,setBusy]=useState(false),[notice,notify]=useNotice();
  async function submit(e){e.preventDefault();if(!supabase||busy)return;
    if(tab==='reg'&&!cleanUsername(username))return notify('Ник: 3–24 символа (латиница, цифры, _).');
    if(tab==='reg'&&pass.length<12)return notify('Пароль должен содержать минимум 12 символов.');
    setBusy(true);let error;
    if(tab==='reg')({error}=await supabase.auth.signUp({email:email.trim(),password:pass,options:{data:{username:username.trim()}}}));
    else if(tab==='login')({error}=await supabase.auth.signInWithPassword({email:email.trim(),password:pass}));
    else ({error}=await supabase.auth.resetPasswordForEmail(email.trim(),{redirectTo:window.location.origin}));
    notify(error?errorText(error):tab==='reg'?'Проверьте почту и подтвердите регистрацию.':tab==='reset'?'Если адрес зарегистрирован, придёт письмо для восстановления.':'Вход выполнен.');setBusy(false);
  }
  return <div className="auth-page"><div className="auth-card"><div className="auth-card__logo"><span>🎮</span><span>Universal Roblox <b>Tier List</b></span></div><p className="auth-card__subtitle">Облачная коллекция Roblox с защитой аккаунта</p><div className="auth-tabs">{[['login','Вход'],['reg','Регистрация'],['reset','Восстановить']].map(([key,label])=><button key={key} className={'auth-tabs__btn '+(tab===key?'active':'')} onClick={()=>{setTab(key);notify('')}}>{label}</button>)}</div><form onSubmit={submit}>{tab==='reg'&&<div className="field"><label>Ник Roblox</label><input autoComplete="nickname" minLength={3} maxLength={24} value={username} onChange={e=>setUsername(e.target.value)} required/></div>}<div className="field"><label>Email</label><input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} required/></div>{tab!=='reset'&&<div className="field"><label>Пароль</label><div className="password-line"><input type={show?'text':'password'} autoComplete={tab==='reg'?'new-password':'current-password'} minLength={tab==='reg'?12:1} value={pass} onChange={e=>setPass(e.target.value)} required/><button type="button" onClick={()=>setShow(v=>!v)}>{show?'Скрыть':'Показать'}</button></div></div>}<button className="btn-primary" disabled={busy} type="submit">{busy?'Обработка…':tab==='login'?'Войти':tab==='reg'?'Зарегистрироваться':'Отправить письмо'}</button><Notice value={notice}/></form><p className="auth-footer">Пароли не хранятся в коде сайта или localStorage. Для регистрации необходим адрес электронной почты.</p></div></div>;
}
function ProfileEditor({profile,reload,notify,theme,setTheme}) {const [bio,setBio]=useState(profile.bio||''),[username,setUsername]=useState(profile.username),[busy,setBusy]=useState(false),[newPass,setNewPass]=useState('');
  async function saveProfile(){if(!cleanUsername(username))return notify('Недопустимый ник.');setBusy(true);const {error}=await supabase.from('profiles').update({username:username.trim(),bio:bio.trim()}).eq('id',profile.id);setBusy(false);if(error)notify(errorText(error));else {notify('Профиль обновлён.');reload()}}
  async function uploadAvatar(e){const file=e.target.files?.[0];if(!file)return;if(file.size>2*1024*1024 || !['image/jpeg','image/png','image/webp'].includes(file.type))return notify('Только JPG, PNG или WebP до 2 МБ.');setBusy(true);const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];const path=`${profile.id}/${crypto.randomUUID()}.${ext}`;
    const {error:uploadErr}=await supabase.storage.from('avatars').upload(path,file,{contentType:file.type,upsert:false});
    if(uploadErr){setBusy(false);return notify(errorText(uploadErr));}
    const {error}=await supabase.from('profiles').update({avatar_path:path}).eq('id',profile.id);if(error){await supabase.storage.from('avatars').remove([path]);notify(errorText(error))}else{if(profile.avatar_path)await supabase.storage.from('avatars').remove([profile.avatar_path]);notify('Аватар обновлён.');reload()}setBusy(false);
  }
  async function updatePassword(e){e.preventDefault();if(newPass.length<12)return notify('Минимум 12 символов.');const {error}=await supabase.auth.updateUser({password:newPass});notify(error?errorText(error):'Пароль изменён.');if(!error)setNewPass('')}
  return <><div className="section-heading"><h1>Мой профиль</h1><p>Редактирование профиля и безопасность.</p></div><div className="profile-view"><div className="profile-view__head"><Portrait profile={profile} size={112}/><div><h2 className="profile-view__name">{profile.username}</h2><p className="small-muted">Аккаунт с {dateText(profile.created_at)} · {profile.role}</p></div></div><div className="profile-form"><label>Ник<input value={username} maxLength={24} onChange={e=>setUsername(e.target.value)}/></label><label>О себе<textarea maxLength={500} rows={4} value={bio} onChange={e=>setBio(e.target.value)}/></label><label>Аватар до 2 МБ<input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadAvatar}/></label><button disabled={busy} className="btn-primary" onClick={saveProfile}>Сохранить профиль</button><h3>Изменить пароль</h3><form className="stacked" onSubmit={updatePassword}><input type="password" minLength={12} placeholder="Новый пароль (12+ символов)" value={newPass} onChange={e=>setNewPass(e.target.value)}/><button className="collection-button">Сменить пароль</button></form><h3>Темы оформления</h3><ThemeGrid theme={theme} onChange={setTheme}/></div></div></>;
}

// Calls are ephemeral: no interception or recording; one-to-one media uses WebRTC.
const CallManager=React.forwardRef(function CallManager({friends,friendProfiles,userId,notify},ref){
 const channels=useRef(new Map()),pc=useRef(null),localStream=useRef(null),screenStream=useRef(null),activeRef=useRef(null),pendingIce=useRef([]);
 const [incoming,setIncoming]=useState(null),[activeCall,setActiveCall]=useState(null),[status,setStatus]=useState(''),[muted,setMuted]=useState(false),[cameraOff,setCameraOff]=useState(false);
 const localVideo=useRef(null),remoteVideo=useRef(null),remoteStream=useRef(null);
 const send=async (friend,event,payload={})=>{const ch=channels.current.get(friend.id);if(!ch)throw Error('Канал звонка пока не подключён.');(()=>{return ch.send({type:'broadcast',event:'signal',payload:{event,from:userId,...payload}})})().then(result=>{if(result!=='ok')throw Error('Не удалось доставить сигнал: '+result)})};
 function cleanup(){if(pc.current){pc.current.onicecandidate=null;pc.current.ontrack=null;pc.current.close();pc.current=null}localStream.current?.getTracks().forEach(t=>t.stop());screenStream.current?.getTracks().forEach(t=>t.stop());localStream.current=null;screenStream.current=null;activeRef.current=null;remoteStream.current=null;pendingIce.current=[];setActiveCall(null);setIncoming(null);setStatus('');setMuted(false);setCameraOff(false)}
 async function finish(){const friend=activeRef.current?.friend;if(friend)try{await send(friend,'hangup')}catch{}cleanup()}
 async function makePeer(friend,stream){const peer=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'}]});pc.current=peer;stream.getTracks().forEach(track=>peer.addTrack(track,stream));peer.onicecandidate=e=>{if(e.candidate)send(friend,'ice',{candidate:e.candidate.toJSON()}).catch(()=>{})};peer.ontrack=e=>{remoteStream.current=e.streams[0];if(remoteVideo.current)remoteVideo.current.srcObject=e.streams[0]};peer.onconnectionstatechange=()=>{if(peer.connectionState==='connected')setStatus('Соединение установлено');else if(['disconnected','failed','closed'].includes(peer.connectionState))setStatus('Связь прервана. Попробуйте перезвонить.')};return peer}
 async function getMedia(withVideo){if(!navigator.mediaDevices?.getUserMedia)throw Error('HTTPS и доступ к микрофону обязательны.');return navigator.mediaDevices.getUserMedia({audio:true,video:withVideo})}
 async function start(friend,withVideo){if(activeRef.current)return notify('Завершите текущий звонок.');try{const stream=await getMedia(withVideo);localStream.current=stream;activeRef.current={friend,withVideo,caller:true};setActiveCall({friend,withVideo});setStatus('Вызываем друга…');await makePeer(friend,stream);await send(friend,'ring',{withVideo});}catch(e){notify(errorText(e));cleanup()}}
 React.useImperativeHandle(ref,()=>({start}),[friends,userId]);
 async function accept(){const call=incoming;if(!call)return;try{const stream=await getMedia(call.withVideo);localStream.current=stream;activeRef.current={friend:call.friend,withVideo:call.withVideo,caller:false};setIncoming(null);setActiveCall({friend:call.friend,withVideo:call.withVideo});setStatus('Подключение…');await makePeer(call.friend,stream);await send(call.friend,'ready');}catch(e){notify(errorText(e));try{await send(call.friend,'hangup')}catch{}cleanup()}}
 async function onSignal(friend,payload){if(payload.from===userId)return;const action=payload.event;
  try{
   if(action==='ring'){if(activeRef.current){await send(friend,'hangup');return}setIncoming({friend,withVideo:!!payload.withVideo});return}
   if(action==='hangup'){if(activeRef.current?.friend.id===friend.id||incoming?.friend.id===friend.id)cleanup();return}
   if(!activeRef.current||activeRef.current.friend.id!==friend.id)return;
   if(action==='ready'&&activeRef.current.caller){const offer=await pc.current.createOffer();await pc.current.setLocalDescription(offer);await send(friend,'offer',{sdp:offer});}
   if(action==='offer'&&!activeRef.current.caller){await pc.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));for(const ice of pendingIce.current.splice(0))await pc.current.addIceCandidate(new RTCIceCandidate(ice));const answer=await pc.current.createAnswer();await pc.current.setLocalDescription(answer);await send(friend,'answer',{sdp:answer});}
   if(action==='answer'&&activeRef.current.caller){await pc.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));for(const ice of pendingIce.current.splice(0))await pc.current.addIceCandidate(new RTCIceCandidate(ice));}
   if(action==='ice'&&pc.current&&payload.candidate){if(pc.current.remoteDescription){try{await pc.current.addIceCandidate(new RTCIceCandidate(payload.candidate))}catch{}}else pendingIce.current.push(payload.candidate)}
  }catch(e){notify(errorText(e))}
 }
 const onSignalRef=useRef(onSignal);onSignalRef.current=onSignal;
 useEffect(()=>{const desired=new Set(friends.map(f=>f.id));for(const [id,ch] of channels.current)if(!desired.has(id)){supabase.removeChannel(ch);channels.current.delete(id)}
   for(const friend of friends)if(!channels.current.has(friend.id)){
    const channel=supabase.channel(`call:${friend.id}`,{config:{private:true}}).on('broadcast',{event:'signal'},({payload})=>onSignalRef.current(friend,payload)).subscribe(status=>{if(status==='CHANNEL_ERROR')notify('Канал звонка: проверьте Realtime RLS.')});
    channels.current.set(friend.id,channel);
   }
   return()=>{};
 },[friends.map(f=>f.id).join(','),userId]);
 useEffect(()=>()=>{for(const ch of channels.current.values())supabase.removeChannel(ch);channels.current.clear();cleanup()},[]);
 useEffect(()=>{if(localVideo.current&&localStream.current)localVideo.current.srcObject=localStream.current;if(remoteVideo.current&&remoteStream.current)remoteVideo.current.srcObject=remoteStream.current},[activeCall]);
 function toggleMic(){const audio=localStream.current?.getAudioTracks()[0];if(audio){audio.enabled=!audio.enabled;setMuted(!audio.enabled)}}
 function toggleVideo(){const track=localStream.current?.getVideoTracks()[0];if(track){track.enabled=!track.enabled;setCameraOff(!track.enabled)}}
 async function screenShare(){if(!activeRef.current?.withVideo)return;try{const display=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});const track=display.getVideoTracks()[0];const sender=pc.current?.getSenders().find(x=>x.track?.kind==='video');if(sender){await sender.replaceTrack(track);screenStream.current=display;track.onended=()=>{const webcam=localStream.current?.getVideoTracks()[0];if(webcam)sender.replaceTrack(webcam).catch(()=>{});screenStream.current=null;};if(localVideo.current)localVideo.current.srcObject=display}}catch(e){notify(errorText(e))}}
 const callOther=f=>{const id=f.requester===userId?f.recipient:f.requester;return friendProfiles[id]?.username||'Друг'};
 return <>{incoming&&<div className="call-toast"><h3>📞 Входящий звонок</h3><p>{callOther(incoming.friend)}</p><button className="btn-primary" onClick={accept}>Ответить</button><button className="collection-button" onClick={()=>{send(incoming.friend,'hangup').catch(()=>{});setIncoming(null)}}>Отклонить</button></div>}{activeCall&&<div className="call-overlay"><div className="call-header"><h3>Звонок: {callOther(activeCall.friend)}</h3><button className="icon-button" onClick={finish}><X/></button></div><p className="small-muted">{status}</p><div className="call-videos"><video playsInline muted autoPlay ref={localVideo}/><video playsInline autoPlay ref={remoteVideo} /></div><div className="call-controls"><button className="collection-button" onClick={toggleMic}><MicOff size={17}/>{muted?'Включить микрофон':'Микрофон'}</button>{activeCall.withVideo&&<><button className="collection-button" onClick={toggleVideo}><VideoOff size={17}/>{cameraOff?'Включить камеру':'Камера'}</button><button className="collection-button" onClick={screenShare}><MonitorUp size={17}/>Экран</button></>}<button className="collection-button danger" onClick={finish}><PhoneOff size={17}/>Завершить</button></div></div>}</>;
});

createRoot(document.getElementById('root')).render(<App/>);
