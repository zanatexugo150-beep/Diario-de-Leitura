import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";

// ══════════════════════════════════════════════════════════════
// TEMA — Claro e Escuro (Etapa 11)
// ══════════════════════════════════════════════════════════════
const THEMES = {
  light: {
    bg:"#FEF6F0",bgAlt:"#FDF0F7",bgCard:"#FFFFFF",
    rose:"#F4A7B9",roseDark:"#E07A96",roseLight:"#FCE4EC",
    lavender:"#C9B8E8",lavenderDark:"#A990D4",lavenderLight:"#EDE7F6",
    mint:"#A8DCC8",mintDark:"#6CB89A",mintLight:"#E8F5EF",
    butter:"#FFE082",butterLight:"#FFF9E0",
    sky:"#90CAF9",skyLight:"#E3F2FD",
    text:"#4A3F5C",textMid:"#7A6B8A",textMuted:"#B0A0C0",
    border:"#EDD8F0",borderMid:"#D4B8E0",
    star:"#FFB300",danger:"#EF5350",dangerLight:"#FFEBEE",
    headerBg:"linear-gradient(135deg,#FCE4EC,#EDE7F6)",
    statBg:"#FFFFFF",
  },
  dark: {
    bg:"#1A1625",bgAlt:"#221D30",bgCard:"#2A2440",
    rose:"#F4A7B9",roseDark:"#E07A96",roseLight:"#3D2535",
    lavender:"#C9B8E8",lavenderDark:"#A990D4",lavenderLight:"#2D2545",
    mint:"#A8DCC8",mintDark:"#6CB89A",mintLight:"#1E3530",
    butter:"#FFE082",butterLight:"#35300F",
    sky:"#90CAF9",skyLight:"#1A2535",
    text:"#EDE7F6",textMid:"#C9B8E8",textMuted:"#7A6B8A",
    border:"#3D3555",borderMid:"#4D4565",
    star:"#FFB300",danger:"#EF5350",dangerLight:"#3D1515",
    headerBg:"linear-gradient(135deg,#2A1F35,#1F1A35)",
    statBg:"#2A2440",
  }
};

// ══════════════════════════════════════════════════════════════
// APIS — Open Library + Google Books
// ══════════════════════════════════════════════════════════════
const cache = {};

async function searchOpenLibrary(query) {
  try {
    const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&fields=key,title,author_name,cover_i,first_publish_year,subject,number_of_pages_median,lending_edition_s,ia&limit=12`;
    const res = await fetch(url); const data = await res.json();
    const results=[]; const seen=new Set();
    for (const doc of (data.docs||[])) {
      if (!doc.cover_i) continue;
      const title=doc.title||query; const k=title.toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      results.push({ id:`ol_${doc.cover_i}`,title,
        author:(doc.author_name||[]).join(", ")||"—",
        cover:`https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg`,
        year:doc.first_publish_year?String(doc.first_publish_year):"",
        pages:doc.number_of_pages_median||0,
        genre:(doc.subject||[]).slice(0,3),synopsis:"",source:"OL",
        ia:(doc.ia&&doc.ia[0])||doc.lending_edition_s||null });
      if (results.length>=8) break;
    }
    return results;
  } catch { return []; }
}

async function searchGoogleBooks(query) {
  try {
    const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=12&printType=books`;
    const res = await fetch(url); const data = await res.json();
    const results=[]; const seen=new Set();
    for (const item of (data.items||[])) {
      const info=item.volumeInfo||{}; const img=info.imageLinks;
      if (!img) continue;
      const raw=img.extraLarge||img.large||img.medium||img.thumbnail||img.smallThumbnail;
      if (!raw) continue;
      const cover=raw.replace(/^http:\/\//,"https://").replace(/zoom=\d/,"zoom=3");
      const title=info.title||query; const k=title.toLowerCase();
      if (seen.has(k)) continue; seen.add(k);
      results.push({ id:item.id,title,author:(info.authors||[]).join(", ")||"—",cover,
        year:info.publishedDate?info.publishedDate.slice(0,4):"",
        pages:info.pageCount||0,genre:info.categories||[],
        synopsis:info.description||"",source:"GB",
        previewLink:info.previewLink||"",ia:null });
      if (results.length>=8) break;
    }
    return results;
  } catch { return []; }
}

async function searchBooks(query) {
  const ck=`q__${query}`; if (cache[ck]) return cache[ck];
  const [ol,gb]=await Promise.all([searchOpenLibrary(query),searchGoogleBooks(query)]);
  const seen=new Set(ol.map(r=>r.title.toLowerCase())); const merged=[...ol];
  for (const r of gb) { if (!seen.has(r.title.toLowerCase())&&merged.length<12){seen.add(r.title.toLowerCase());merged.push(r);} }
  cache[ck]=merged; return merged;
}

async function autoCover(title,author) {
  const k=`ac__${title}__${author}`; if (cache[k]!==undefined) return cache[k];
  const res=await searchBooks(`${title} ${author}`);
  cache[k]=res[0]?.cover||null; return cache[k];
}

async function fetchSimilarBooks(book) {
  const queries=[];
  if (book.genre?.length) queries.push(book.genre[0]);
  if (book.author) queries.push(book.author);
  const all=await Promise.all(queries.map(q=>searchBooks(q)));
  const seen=new Set([book.title.toLowerCase()]); const merged=[];
  for (const arr of all) for (const r of arr) { if (!seen.has(r.title.toLowerCase())){seen.add(r.title.toLowerCase());merged.push(r);} }
  return merged.slice(0,8);
}

async function findDownloadLinks(r) {
  const iaId=r.ia||null;
  if (iaId) {
    try {
      const metaRes=await fetch(`https://archive.org/metadata/${iaId}/files`);
      const meta=await metaRes.json(); const files=meta.result||[];
      const epub=files.find(f=>f.name?.endsWith(".epub"));
      const pdf=files.find(f=>f.name?.endsWith(".pdf")&&!f.name.includes("_text"));
      const txt=files.find(f=>f.name?.endsWith("_djvu.txt")||f.name?.endsWith(".txt"));
      return { found:true,source:"Archive.org",read:`https://archive.org/details/${iaId}`,
        epub:epub?`https://archive.org/download/${iaId}/${epub.name}`:null,
        pdf:pdf?`https://archive.org/download/${iaId}/${pdf.name}`:null,
        txt:txt?`https://archive.org/download/${iaId}/${txt.name}`:null };
    } catch {}
  }
  try {
    const q=encodeURIComponent(`${r.title} ${r.author||""}`);
    const olRes=await fetch(`https://openlibrary.org/search.json?q=${q}&fields=ia,lending_edition_s&limit=8`);
    const olData=await olRes.json();
    const doc=(olData.docs||[]).find(d=>d.ia?.length||d.lending_edition_s);
    if (doc) {
      const ia=(doc.ia&&doc.ia[0])||doc.lending_edition_s;
      if (ia) {
        const metaRes=await fetch(`https://archive.org/metadata/${ia}/files`);
        const meta=await metaRes.json(); const files=meta.result||[];
        const epub=files.find(f=>f.name?.endsWith(".epub"));
        const pdf=files.find(f=>f.name?.endsWith(".pdf")&&!f.name.includes("_text"));
        const txt=files.find(f=>f.name?.endsWith("_djvu.txt"));
        return { found:true,source:"Archive.org",read:`https://archive.org/details/${ia}`,
          epub:epub?`https://archive.org/download/${ia}/${epub.name}`:null,
          pdf:pdf?`https://archive.org/download/${ia}/${pdf.name}`:null,
          txt:txt?`https://archive.org/download/${ia}/${txt.name}`:null };
      }
    }
  } catch {}
  try {
    const gutRes=await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(r.title)}`);
    const gutData=await gutRes.json();
    const gutBook=(gutData.results||[]).find(b=>b.title?.toLowerCase().includes(r.title.toLowerCase().slice(0,8)));
    if (gutBook) {
      const fmt=gutBook.formats||{};
      return { found:true,source:"Project Gutenberg",
        read:fmt["text/html"]||`https://www.gutenberg.org/ebooks/${gutBook.id}`,
        epub:fmt["application/epub+zip"]||null,
        pdf:fmt["application/pdf"]||null,
        txt:fmt["text/plain; charset=utf-8"]||fmt["text/plain"]||null };
    }
  } catch {}
  return { found:false };
}

// ══════════════════════════════════════════════════════════════
// DADOS
// ══════════════════════════════════════════════════════════════
const TODAY=new Date().toISOString().split("T")[0];
const YEAR=new Date().getFullYear();
let nextId=10; const genId=()=>++nextId;

const STATUS_LIST=["lendo","lido","quero ler","pausado","abandonado"];
const STATUS_MAP={
  "lido":      {bg:"mintLight",   color:"mintDark",     label:"✓ Lido"},
  "lendo":     {bg:"butterLight", color:"butter_text",  label:"▶ Lendo"},
  "quero ler": {bg:"lavenderLight",color:"lavenderDark",label:"◎ Quero ler"},
  "pausado":   {bg:"skyLight",    color:"sky_text",     label:"⏸ Pausado"},
  "abandonado":{bg:"dangerLight", color:"danger",       label:"✕ Abandonado"},
};
const GENRES_LIST=["Romance","Dark Romance","Paranormal","Fantasia","Suspense","Máfia","Contemporâneo","Médico","Histórico","Clássico","Infantil","Jovem Adulto","Mangá","Ficção Científica","Terror","Autoajuda","Biografia","Policial","Poesia","Conto"];
const MOODS=["😍","🥹","🔥","😭","😤","🤯","💕","✨","😴","🎉","📖","💀","🫶","🌙","⭐"];
const SERIES_LIST=["Série única","Trilogia","Saga","Duologia","Antologia"];

// Conquistas (Etapa 10)
const ACHIEVEMENTS=[
  {id:"first",icon:"🏆",title:"Primeira Leitura",desc:"Leu o primeiro livro",check:b=>b.filter(x=>x.status==="lido").length>=1},
  {id:"ten",icon:"🥇",title:"10 Livros",desc:"Leu 10 livros",check:b=>b.filter(x=>x.status==="lido").length>=10},
  {id:"fifty",icon:"🎖️",title:"50 Livros",desc:"Leu 50 livros",check:b=>b.filter(x=>x.status==="lido").length>=50},
  {id:"hundred",icon:"💎",title:"100 Livros",desc:"Leu 100 livros",check:b=>b.filter(x=>x.status==="lido").length>=100},
  {id:"pages1k",icon:"📄",title:"1.000 Páginas",desc:"Leu 1000 páginas",check:b=>b.filter(x=>x.status==="lido").reduce((s,x)=>s+(x.pages||0),0)>=1000},
  {id:"pages10k",icon:"📚",title:"10.000 Páginas",desc:"Leu 10000 páginas",check:b=>b.filter(x=>x.status==="lido").reduce((s,x)=>s+(x.pages||0),0)>=10000},
  {id:"fav5",icon:"❤️",title:"Colecionador",desc:"5 livros favoritos",check:b=>b.filter(x=>x.favorite).length>=5},
  {id:"genres5",icon:"🎭",title:"Eclético",desc:"Leu 5 gêneros diferentes",check:b=>{const gs=new Set(b.filter(x=>x.status==="lido").flatMap(x=>x.genre||[]));return gs.size>=5;}},
  {id:"review5",icon:"✍️",title:"Crítico",desc:"5 resenhas escritas",check:b=>b.filter(x=>x.review?.trim()).length>=5},
  {id:"diary10",icon:"📝",title:"Diário Ativo",desc:"10 entradas no diário",check:b=>b.reduce((s,x)=>s+(x.entries?.length||0),0)>=10},
];

const SAMPLE_BOOKS=[
  {id:1,title:"Uma Esposa para o Doutor",author:"Jéssica Driely",genre:["Romance","Médico"],series:"",status:"lido",rating:5,progress:100,cover:null,pages:312,year:"2023",addedAt:"2024-01-10",finishedAt:"2024-01-18",synopsis:"Charlotte e Rowan: um casamento por contrato que nenhum dos dois esperava levar a sério.",review:"Amei demais! A química entre os personagens é incrível. 💕",entries:[{id:1,date:"2024-01-12",text:"Não consigo parar de ler! Rowan é tudo 😍",mood:"😍",rating:5},{id:2,date:"2024-01-18",text:"Terminei chorando de emoção. Final perfeito!",mood:"🥹",rating:5}],tags:["favorito"],favorite:true},
  {id:2,title:"Renzo Romano",author:"Thamy Bastida",genre:["Dark Romance","Máfia"],series:"Império Romano",status:"lendo",rating:0,progress:62,cover:null,pages:428,year:"2023",addedAt:"2024-02-01",finishedAt:null,synopsis:"Nas garras do capo mais temido do Império Romano.",review:"",entries:[{id:1,date:"2024-02-05",text:"Renzo é intenso demais... adorando cada página 🔥",mood:"🔥",rating:4}],tags:["máfia"],favorite:false},
  {id:3,title:"O Instinto do Lobo",author:"Bruna Rodrigues",genre:["Paranormal","Romance"],series:"",status:"lido",rating:5,progress:100,cover:null,pages:380,year:"2022",addedAt:"2024-01-20",finishedAt:"2024-02-05",synopsis:"Grávida do lobo alfa. Romance paranormal intenso.",review:"Melhor livro do mês! O alfa é TUDO 🐺❤️",entries:[],tags:["favorito"],favorite:true},
  {id:4,title:"Legado Obscuro",author:"Clarissa Coral",genre:["Dark Romance","Suspense"],series:"",status:"lido",rating:4,progress:100,cover:null,pages:445,year:"2021",addedAt:"2024-01-05",finishedAt:"2024-01-25",synopsis:"A verdade é mais densa do que se vê.",review:"Que final inesperado! Fiquei sem fala.",entries:[],tags:[],favorite:false},
  {id:5,title:"Quando Desisti de Você",author:"Bela Kelly",genre:["Romance Contemporâneo"],series:"",status:"quero ler",rating:0,progress:0,cover:null,pages:310,year:"2024",addedAt:"2024-02-20",finishedAt:null,synopsis:"Segundas chances que o coração não esquece.",review:"",entries:[],tags:[],favorite:false},
  {id:6,title:"Ares",author:"Thamy Bastida",genre:["Dark Romance","Máfia"],series:"Império Romano",status:"lendo",rating:0,progress:45,cover:null,pages:356,year:"2022",addedAt:"2024-02-10",finishedAt:null,synopsis:"A escolha do Dom nunca foi tão perigosa.",review:"",entries:[],tags:[],favorite:false},
];

// Metas padrão (Etapa 8)
const DEFAULT_GOALS={ annual:50,monthly:5,weekly:1,pages:10000 };

const pagesPerDay=(book)=>{
  if (!book.finishedAt||!book.addedAt||!book.pages) return 0;
  const d=Math.round((new Date(book.finishedAt)-new Date(book.addedAt))/86400000);
  return d>0?Math.round(book.pages/d):book.pages;
};

// ══════════════════════════════════════════════════════════════
// COMPONENTES BASE (Etapa 1 — separados logicamente)
// ══════════════════════════════════════════════════════════════

// CoverImg
const CoverImg=({book,width="100%",height="100%",radius=10,T})=>{
  const [src,setSrc]=useState(book.cover);
  const [state,setState]=useState(book.cover?"ok":"loading");
  useEffect(()=>{
    if (book.cover){setSrc(book.cover);setState("ok");return;}
    let dead=false;
    autoCover(book.title,book.author).then(url=>{
      if(dead)return; if(url){setSrc(url);setState("ok");}else setState("err");
    });
    return()=>{dead=true;};
  },[book.id,book.cover]);
  const base={width,height,borderRadius:radius,display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",flexShrink:0};
  if(state==="loading") return <div style={{...base,background:T.roseLight}}><div style={{width:20,height:20,border:`2px solid ${T.rose}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>;
  if(state==="err") return <div style={{...base,background:`linear-gradient(135deg,${T.lavenderLight},${T.roseLight})`,flexDirection:"column"}}><span style={{fontSize:28}}>📚</span></div>;
  return <img src={src} alt={book.title} style={{...base,objectFit:"cover"}} onError={()=>setState("err")}/>;
};

// Stars
const Stars=({value,onChange,size=18,readonly=false})=>(
  <div style={{display:"flex",gap:2}}>
    {[1,2,3,4,5].map(n=>(
      <span key={n} onClick={()=>!readonly&&onChange?.(n)}
        style={{cursor:readonly?"default":"pointer",color:n<=value?"#FFB300":"#D4B8E0",fontSize:size,lineHeight:1,transition:"transform .15s",display:"inline-block"}}
        onMouseEnter={e=>{if(!readonly)e.target.style.transform="scale(1.3)";}}
        onMouseLeave={e=>{e.target.style.transform="scale(1)";}}>★</span>
    ))}
  </div>
);

// ProgressBar
const Bar=({value,color,height=6,T})=>{
  const c=color||T?.rose||"#F4A7B9";
  return(
    <div style={{background:T?.border||"#EDD8F0",borderRadius:99,height,overflow:"hidden"}}>
      <div style={{width:`${Math.min(100,Math.max(0,value))}%`,background:c,height:"100%",borderRadius:99,transition:"width .4s"}}/>
    </div>
  );
};

// SearchBar
const SearchBar=({value,onChange,placeholder,T})=>(
  <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder||"🔍 Buscar..."}
    style={{flex:1,minWidth:160,background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"9px 14px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
);

// StatusPill
const StatusPill=({status,small=false,T})=>{
  const MAP={
    "lido":      {bg:T.mintLight,   color:T.mintDark,     label:"✓ Lido"},
    "lendo":     {bg:T.butterLight, color:"#B8860B",      label:"▶ Lendo"},
    "quero ler": {bg:T.lavenderLight,color:T.lavenderDark,label:"◎ Quero ler"},
    "pausado":   {bg:T.skyLight,    color:"#1976D2",      label:"⏸ Pausado"},
    "abandonado":{bg:T.dangerLight, color:T.danger,       label:"✕ Abandonado"},
  };
  const s=MAP[status]||MAP["quero ler"];
  return <span style={{background:s.bg,color:s.color,fontSize:small?9:10,fontWeight:700,padding:small?"2px 7px":"3px 9px",borderRadius:99,whiteSpace:"nowrap"}}>{s.label}</span>;
};

const Btn=({children,onClick,variant="primary",small=false,disabled=false,style:ex={},T})=>{
  const V={
    primary:{bg:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:"#fff",border:"none",shadow:`0 3px 10px ${T.rose}60`},
    secondary:{bg:T.bgCard,color:T.text,border:`1.5px solid ${T.border}`,shadow:"none"},
    ghost:{bg:"transparent",color:T.textMid,border:"none",shadow:"none"},
    danger:{bg:T.dangerLight,color:T.danger,border:`1px solid ${T.danger}30`,shadow:"none"},
    lavender:{bg:`linear-gradient(135deg,${T.lavender},${T.lavenderDark})`,color:"#fff",border:"none",shadow:`0 3px 10px ${T.lavender}60`},
    mint:{bg:`linear-gradient(135deg,${T.mint},${T.mintDark})`,color:"#fff",border:"none",shadow:`0 3px 10px ${T.mint}60`},
  };
  const v=V[variant]||V.primary;
  return <button onClick={onClick} disabled={disabled} style={{background:v.bg,color:v.color,border:v.border,borderRadius:12,padding:small?"6px 14px":"10px 20px",fontWeight:700,fontSize:small?11:13,cursor:disabled?"not-allowed":"pointer",boxShadow:v.shadow,opacity:disabled?.5:1,transition:"all .2s",fontFamily:"inherit",...ex}}>{children}</button>;
};

const Input=({label,value,onChange,placeholder,type="text",multiline=false,rows=3,T})=>(
  <div style={{display:"flex",flexDirection:"column",gap:5}}>
    {label&&<label style={{color:T.textMid,fontSize:12,fontWeight:700}}>{label}</label>}
    {multiline
      ?<textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows}
          style={{background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 14px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical"}}/>
      :<input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          style={{background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 14px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
    }
  </div>
);


// ══════════════════════════════════════════════════════════════
// COVER PICKER
// ══════════════════════════════════════════════════════════════
const CoverResultCard=({r,selected,onSelect,T})=>{
  const [ok,setOk]=useState(true); const sel=selected?.id===r.id;
  return(
    <div onClick={()=>onSelect(r)} style={{cursor:"pointer",borderRadius:12,overflow:"hidden",border:`2px solid ${sel?T.rose:T.border}`,background:T.bgCard,transition:"all .2s",transform:sel?"scale(1.04)":"scale(1)"}}>
      <div style={{position:"relative",paddingBottom:"148%",background:T.roseLight}}>
        {ok?<img src={r.cover} alt={r.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setOk(false)}/>
           :<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:24}}>📚</span></div>}
        {sel&&<div style={{position:"absolute",top:6,right:6,background:T.rose,borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{color:"#fff",fontSize:13,fontWeight:900}}>✓</span></div>}
      </div>
      <div style={{padding:"7px 8px 9px"}}>
        <div style={{color:T.text,fontSize:10,fontWeight:700,lineHeight:1.3,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{r.title}</div>
        <div style={{color:T.textMuted,fontSize:9,marginTop:1}}>{r.author}</div>
        {r.year&&<div style={{color:T.lavenderDark,fontSize:9,marginTop:1}}>{r.year}</div>}
      </div>
    </div>
  );
};

const CoverPicker=({initialQuery="",onSelect,onClose,T})=>{
  const [aba,setAba]=useState("online");
  // Aba online
  const [query,setQuery]=useState(initialQuery);
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [selected,setSelected]=useState(null);
  const ref=useRef();
  // Aba celular
  const [preview,setPreview]=useState(null);

  const doSearch=useCallback(async(q)=>{
    const t=(q||"").trim(); if(!t)return;
    setLoading(true);setSearched(true);setSelected(null);
    setResults(await searchBooks(t)); setLoading(false);
  },[]);
  useEffect(()=>{if(initialQuery)doSearch(initialQuery);setTimeout(()=>ref.current?.focus(),120);},[]);

  // Lê arquivo e converte para base64
  const handleFile=(e)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=(ev)=>setPreview(ev.target.result);
    reader.readAsDataURL(file);
    // Limpa o value para permitir selecionar o mesmo arquivo de novo
    e.target.value="";
  };

  const handleUsePhoto=()=>{
    if(!preview)return;
    onSelect({cover:preview,title:"",author:"",year:"",pages:0,genre:[],synopsis:""});
  };

  const ABAS=[
    {id:"online", icon:"🌐", label:"Buscar online"},
    {id:"celular",icon:"📱", label:"Minha galeria"},
  ];

  // IDs únicos para os inputs (evita conflito se abrir duas vezes)
  const idGaleria="cp-galeria-"+Math.random().toString(36).slice(2,7);
  const idCamera ="cp-camera-"+Math.random().toString(36).slice(2,7);

  return(
    <>
      {/* Inputs FORA do modal — assim o browser mobile consegue abrir */}
      <input id={idGaleria} type="file" accept="image/*"
        style={{position:"fixed",left:-9999,top:-9999,opacity:0,width:1,height:1}}
        onChange={handleFile}/>
      <input id={idCamera} type="file" accept="image/*" capture="environment"
        style={{position:"fixed",left:-9999,top:-9999,opacity:0,width:1,height:1}}
        onChange={handleFile}/>

      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.65)",backdropFilter:"blur(6px)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.bgCard,borderRadius:24,width:"100%",maxWidth:520,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.4)",overflow:"hidden"}}>

          {/* Header */}
          <div style={{padding:"18px 20px 0",borderBottom:`1px solid ${T.border}`,background:T.headerBg,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{color:T.text,fontSize:17,fontWeight:900}}>📸 Escolher capa</div>
              <button onClick={onClose} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:16,color:T.textMid,display:"flex",alignItems:"center",justifyContent:"center"}}>✕</button>
            </div>
            <div style={{display:"flex",gap:0}}>
              {ABAS.map(a=>(
                <button key={a.id} onClick={()=>setAba(a.id)}
                  style={{flex:1,padding:"10px 0",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",color:aba===a.id?T.roseDark:T.textMid,fontWeight:aba===a.id?800:600,fontSize:13,borderBottom:`3px solid ${aba===a.id?T.rose:"transparent"}`,transition:"all .2s"}}>
                  {a.icon} {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── ABA ONLINE ── */}
          {aba==="online"&&(
            <>
              <div style={{padding:"14px 20px 0",flexShrink:0}}>
                <div style={{display:"flex",gap:8,marginBottom:8}}>
                  <input ref={ref} value={query}
                    onChange={e=>setQuery(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter"){e.stopPropagation();doSearch(query);}}}
                    placeholder="Digite o nome do livro ou autor..."
                    style={{flex:1,background:T.bgAlt,border:`1.5px solid ${T.borderMid}`,borderRadius:12,padding:"11px 14px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
                  <button onClick={e=>{e.stopPropagation();doSearch(query);}} disabled={loading}
                    style={{background:loading?T.border:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:"#fff",border:"none",borderRadius:12,padding:"0 20px",fontWeight:800,fontSize:13,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",flexShrink:0}}>
                    {loading?"⏳":"Buscar"}
                  </button>
                </div>
                <div style={{color:T.textMuted,fontSize:11,marginBottom:12}}>🌎 Open Library + Google Books</div>
              </div>
              <div style={{flex:1,overflowY:"auto",padding:"0 20px 20px"}}>
                {loading&&<div style={{textAlign:"center",padding:"40px 0"}}><div style={{width:40,height:40,border:`3px solid ${T.rose}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 12px"}}/><div style={{color:T.textMuted,fontSize:13}}>Buscando capas... 📚</div></div>}
                {!loading&&searched&&!results.length&&<div style={{textAlign:"center",padding:"40px 0"}}><div style={{fontSize:40,marginBottom:10}}>🔍</div><div style={{color:T.text,fontSize:14,fontWeight:700,marginBottom:4}}>Nenhuma capa encontrada</div><div style={{color:T.textMuted,fontSize:12}}>Tente em inglês ou palavras diferentes</div></div>}
                {!loading&&!searched&&<div style={{textAlign:"center",padding:"32px 0"}}><div style={{fontSize:48,marginBottom:12}}>🔍</div><div style={{color:T.text,fontWeight:800,fontSize:15,marginBottom:6}}>Busque a capa online</div><div style={{color:T.textMuted,fontSize:12,lineHeight:1.8}}>Digite o nome do livro acima</div></div>}
                {!loading&&results.length>0&&(
                  <div>
                    <div style={{color:T.textMuted,fontSize:11,marginBottom:12}}>{results.length} capas — toque para selecionar ✨</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                      {results.map((r,i)=><CoverResultCard key={r.id||i} r={r} selected={selected} onSelect={setSelected} T={T}/>)}
                    </div>
                  </div>
                )}
              </div>
              {selected&&(
                <div style={{padding:"14px 20px",borderTop:`1px solid ${T.border}`,background:T.roseLight,display:"flex",gap:12,alignItems:"center",flexShrink:0}}>
                  <img src={selected.cover} alt="" style={{width:40,height:58,objectFit:"cover",borderRadius:8,border:`1px solid ${T.border}`}} onError={e=>e.target.style.display="none"}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{color:T.text,fontSize:12,fontWeight:700,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{selected.title}</div>
                    <div style={{color:T.textMuted,fontSize:11}}>{selected.author}{selected.year?` · ${selected.year}`:""}</div>
                  </div>
                  <Btn onClick={()=>onSelect(selected)} T={T}>Usar esta ✓</Btn>
                </div>
              )}
            </>
          )}

          {/* ── ABA CELULAR ── */}
          {aba==="celular"&&(
            <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",alignItems:"center",gap:20}}>
              {preview?(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:16,width:"100%"}}>
                  <div style={{position:"relative",width:160,height:235,borderRadius:16,overflow:"hidden",boxShadow:"0 8px 32px rgba(0,0,0,.2)",border:`3px solid ${T.rose}`}}>
                    <img src={preview} alt="Capa" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    <div style={{position:"absolute",top:8,right:8,background:T.rose,borderRadius:"50%",width:24,height:24,display:"flex",alignItems:"center",justifyContent:"center"}}>
                      <span style={{color:"#fff",fontSize:14,fontWeight:900}}>✓</span>
                    </div>
                  </div>
                  <div style={{color:T.text,fontSize:13,fontWeight:700}}>Foto selecionada! ✨</div>
                  <div style={{display:"flex",gap:10,width:"100%",maxWidth:280}}>
                    {/* Trocar — usa label para abrir galeria novamente */}
                    <label htmlFor={idGaleria}
                      style={{flex:1,background:T.bgAlt,color:T.textMid,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 0",fontWeight:700,fontSize:13,cursor:"pointer",fontFamily:"inherit",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center"}}>
                      🔄 Trocar
                    </label>
                    <button onClick={handleUsePhoto}
                      style={{flex:1,background:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:"#fff",border:"none",borderRadius:12,padding:"10px 0",fontWeight:800,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:`0 4px 12px ${T.rose}60`}}>
                      ✓ Usar esta
                    </button>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:14,width:"100%",maxWidth:320}}>
                  <div style={{fontSize:56}}>📱</div>
                  <div style={{color:T.text,fontSize:16,fontWeight:800,textAlign:"center"}}>Escolha uma foto</div>
                  <div style={{color:T.textMuted,fontSize:13,textAlign:"center",lineHeight:1.6}}>Selecione da galeria ou tire uma foto da capa física do livro</div>

                  {/* GALERIA — label aponta para o input fora do modal */}
                  <label htmlFor={idGaleria}
                    style={{width:"100%",background:`linear-gradient(135deg,${T.lavender},${T.lavenderDark})`,color:"#fff",border:"none",borderRadius:16,padding:"16px 0",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:`0 4px 16px ${T.lavender}50`}}>
                    <span style={{fontSize:22}}>🖼️</span> Abrir galeria de fotos
                  </label>

                  {/* CÂMERA — label aponta para o input com capture */}
                  <label htmlFor={idCamera}
                    style={{width:"100%",background:`linear-gradient(135deg,${T.mint},${T.mintDark})`,color:"#fff",border:"none",borderRadius:16,padding:"16px 0",fontWeight:800,fontSize:15,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:10,boxShadow:`0 4px 16px ${T.mint}50`}}>
                    <span style={{fontSize:22}}>📷</span> Tirar foto agora
                  </label>

                  <div style={{color:T.textMuted,fontSize:11,textAlign:"center"}}>Suporta JPG, PNG, WEBP e outros formatos</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};
// ══════════════════════════════════════════════════════════════
// BOOK CARD — Etapa 3 melhorado
// ══════════════════════════════════════════════════════════════
const BookCard=({book,onClick,onToggleFav,T})=>{
  const [hov,setHov]=useState(false);
  return(
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)} onClick={()=>onClick(book)}
      style={{cursor:"pointer",borderRadius:16,overflow:"hidden",background:T.bgCard,border:`1.5px solid ${hov?T.rose:T.border}`,transition:"all .25s",transform:hov?"translateY(-5px)":"none",boxShadow:hov?`0 16px 32px ${T.rose}25`:`0 2px 8px rgba(0,0,0,.08)`}}>
      <div style={{position:"relative",paddingBottom:"148%"}}>
        <div style={{position:"absolute",inset:0}}><CoverImg book={book} width="100%" height="100%" radius={0} T={T}/></div>
        <div style={{position:"absolute",top:7,left:7,zIndex:2}}><StatusPill status={book.status} small T={T}/></div>
        {/* Favorito clicável */}
        <div style={{position:"absolute",top:6,right:6,zIndex:3}} onClick={e=>{e.stopPropagation();onToggleFav(book.id);}}>
          <span style={{fontSize:16,cursor:"pointer",filter:book.favorite?"none":"brightness(.6)",transition:"all .2s",display:"block"}}>{book.favorite?"❤️":"🤍"}</span>
        </div>
        {book.status==="lendo"&&(
          <div style={{position:"absolute",bottom:0,left:0,right:0,padding:"20px 8px 7px",background:"linear-gradient(transparent,rgba(0,0,0,.5))",zIndex:2}}>
            <Bar value={book.progress} T={T} height={4}/>
            <span style={{color:"#fff",fontSize:10,fontWeight:700}}>{book.progress}%</span>
          </div>
        )}
      </div>
      <div style={{padding:"10px 10px 12px"}}>
        <div style={{color:T.text,fontSize:12,fontWeight:800,lineHeight:1.3,marginBottom:2,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{book.title}</div>
        <div style={{color:T.textMuted,fontSize:10,marginBottom:4}}>{book.author}</div>
        {/* Ano e páginas */}
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:5}}>
          {book.year&&<span style={{background:T.butterLight,color:"#B8860B",fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:5}}>📅 {book.year}</span>}
          {book.pages>0&&<span style={{background:T.skyLight,color:"#1565C0",fontSize:8,fontWeight:700,padding:"2px 5px",borderRadius:5}}>📄 {book.pages}p</span>}
        </div>
        {book.rating>0&&<Stars value={book.rating} readonly size={12}/>}
        {book.genre?.length>0&&(
          <div style={{marginTop:4,display:"flex",gap:3,flexWrap:"wrap"}}>
            {book.genre.slice(0,2).map(g=><span key={g} style={{background:T.roseLight,color:T.roseDark,fontSize:8,padding:"2px 5px",borderRadius:99,fontWeight:700}}>{g}</span>)}
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// FORMULÁRIO DE LIVRO
// ══════════════════════════════════════════════════════════════
const BookForm=({book:initial,onSave,onClose,T})=>{
  const isEdit=!!initial?.id;
  const blank={id:null,title:"",author:"",genre:[],series:"",status:"quero ler",rating:0,progress:0,cover:null,pages:0,year:"",addedAt:TODAY,finishedAt:null,synopsis:"",review:"",entries:[],tags:[],favorite:false};
  const [form,setForm]=useState(initial?{...blank,...initial}:blank);
  const [showPicker,setShowPicker]=useState(false);
  const [tagInput,setTagInput]=useState("");
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const addGenre=(g)=>{if(g&&!form.genre.includes(g))set("genre",[...form.genre,g]);};
  const addTag=(t)=>{const tag=t.trim().toLowerCase();if(tag&&!form.tags.includes(tag))set("tags",[...form.tags,tag]);setTagInput("");};
  const handleSave=()=>{if(!form.title.trim()){alert("Título é obrigatório!");return;}onSave({...form,id:form.id||genId()});};
  const handleCoverSelect=(r)=>{
    setForm(f=>({...f,cover:r.cover,title:f.title||r.title,author:f.author||r.author,pages:f.pages||r.pages||0,year:f.year||r.year||"",genre:f.genre.length?f.genre:r.genre.slice(0,2),synopsis:f.synopsis||r.synopsis||""}));
    setShowPicker(false);
  };
  return(
    <>
      {showPicker&&<CoverPicker initialQuery={`${form.title} ${form.author}`} onSelect={handleCoverSelect} onClose={()=>setShowPicker(false)} T={T}/>}
      <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.55)",backdropFilter:"blur(5px)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
        <div onClick={e=>e.stopPropagation()} style={{background:T.bgCard,borderRadius:24,width:"100%",maxWidth:640,maxHeight:"92vh",display:"flex",flexDirection:"column",boxShadow:"0 32px 80px rgba(0,0,0,.3)",overflow:"hidden"}}>
          <div style={{padding:"18px 24px 14px",borderBottom:`1px solid ${T.border}`,background:T.headerBg,flexShrink:0}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{color:T.text,fontSize:18,fontWeight:800}}>{isEdit?"✏️ Editar livro":"📚 Adicionar livro"}</div>
              <button onClick={onClose} style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:"50%",width:34,height:34,cursor:"pointer",fontSize:18,color:T.textMid}}>✕</button>
            </div>
          </div>
          <div style={{flex:1,overflowY:"auto",padding:24}}>
            <div style={{display:"grid",gridTemplateColumns:"130px 1fr",gap:20}}>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div style={{width:"100%",aspectRatio:"0.68",borderRadius:12,overflow:"hidden",border:`2px dashed ${T.border}`,cursor:"pointer"}} onClick={()=>setShowPicker(true)}>
                  {form.cover?<img src={form.cover} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/>
                    :<div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:T.roseLight,gap:6}}><span style={{fontSize:28}}>📸</span><span style={{color:T.textMuted,fontSize:10,textAlign:"center"}}>Buscar capa</span></div>}
                </div>
                <Btn onClick={()=>setShowPicker(true)} variant="secondary" small T={T}>🔍 Buscar capa</Btn>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:12}}>
                <Input label="Título *" value={form.title} onChange={v=>set("title",v)} placeholder="Nome do livro" T={T}/>
                <Input label="Autor(a)" value={form.author} onChange={v=>set("author",v)} placeholder="Nome do autor" T={T}/>
                <Input label="Série" value={form.series||""} onChange={v=>set("series",v)} placeholder="Ex: Império Romano" T={T}/>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div>
                    <label style={{color:T.textMid,fontSize:12,fontWeight:700,display:"block",marginBottom:5}}>Status</label>
                    <select value={form.status} onChange={e=>set("status",e.target.value)} style={{width:"100%",background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"10px 14px",color:T.text,fontSize:13,fontFamily:"inherit",outline:"none"}}>
                      {STATUS_LIST.map(s=><option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                    <Input label="Páginas" value={form.pages||""} onChange={v=>set("pages",Number(v)||0)} placeholder="0" type="number" T={T}/>
                    <Input label="Ano" value={form.year||""} onChange={v=>set("year",v)} placeholder="2024" T={T}/>
                  </div>
                </div>
                {(form.status==="lendo"||form.status==="lido")&&(
                  <div>
                    <label style={{color:T.textMid,fontSize:12,fontWeight:700,display:"block",marginBottom:8}}>Progresso: {form.progress}%</label>
                    <input type="range" min="0" max="100" value={form.progress} onChange={e=>set("progress",Number(e.target.value))} style={{width:"100%",accentColor:T.rose}}/>
                    <Bar value={form.progress} T={T}/>
                  </div>
                )}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <Input label="Adicionado em" value={form.addedAt} onChange={v=>set("addedAt",v)} type="date" T={T}/>
                  {form.status==="lido"&&<Input label="Finalizado em" value={form.finishedAt||""} onChange={v=>set("finishedAt",v)} type="date" T={T}/>}
                </div>
              </div>
            </div>
            <div style={{marginTop:18}}>
              <label style={{color:T.textMid,fontSize:12,fontWeight:700,display:"block",marginBottom:8}}>Gêneros</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:10}}>{form.genre.map(g=><span key={g} onClick={()=>set("genre",form.genre.filter(x=>x!==g))} style={{background:T.roseLight,color:T.roseDark,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:99,cursor:"pointer"}}>{g} ✕</span>)}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>{GENRES_LIST.filter(g=>!form.genre.includes(g)).slice(0,12).map(g=><span key={g} onClick={()=>addGenre(g)} style={{background:T.lavenderLight,color:T.lavenderDark,fontSize:10,padding:"3px 8px",borderRadius:99,cursor:"pointer",fontWeight:600}}>{g}</span>)}</div>
            </div>
            <div style={{marginTop:14}}>
              <label style={{color:T.textMid,fontSize:12,fontWeight:700,display:"block",marginBottom:8}}>Tags</label>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>{form.tags.map(t=><span key={t} onClick={()=>set("tags",form.tags.filter(x=>x!==t))} style={{background:T.butterLight,color:"#B8860B",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99,cursor:"pointer"}}>#{t} ✕</span>)}</div>
              <div style={{display:"flex",gap:8}}>
                <input value={tagInput} onChange={e=>setTagInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTag(tagInput)} placeholder="Nova tag (Enter)" style={{flex:1,background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"8px 12px",color:T.text,fontSize:12,outline:"none",fontFamily:"inherit"}}/>
                <Btn onClick={()=>addTag(tagInput)} variant="secondary" small T={T}>+</Btn>
              </div>
            </div>
            <div style={{marginTop:14,display:"flex",alignItems:"center",gap:20}}>
              <div><label style={{color:T.textMid,fontSize:12,fontWeight:700,display:"block",marginBottom:6}}>Avaliação</label><Stars value={form.rating} onChange={v=>set("rating",v)} size={24}/></div>
              <div style={{marginTop:22}}><span onClick={()=>set("favorite",!form.favorite)} style={{cursor:"pointer",fontSize:24,transition:"all .2s"}}>{form.favorite?"❤️":"🤍"}</span><span style={{color:T.textMuted,fontSize:11,marginLeft:6}}>Favorito</span></div>
            </div>
            <div style={{marginTop:14}}><Input label="Sinopse" value={form.synopsis} onChange={v=>set("synopsis",v)} placeholder="Sobre o livro..." multiline rows={3} T={T}/></div>
            {(form.status==="lido"||form.rating>0)&&<div style={{marginTop:14}}><Input label="Minha resenha" value={form.review} onChange={v=>set("review",v)} placeholder="O que achei deste livro..." multiline rows={3} T={T}/></div>}
          </div>
          <div style={{padding:"16px 24px",borderTop:`1px solid ${T.border}`,display:"flex",gap:10,justifyContent:"flex-end",flexShrink:0}}>
            <Btn onClick={onClose} variant="secondary" T={T}>Cancelar</Btn>
            <Btn onClick={handleSave} T={T}>{isEdit?"💾 Salvar":"✨ Adicionar"}</Btn>
          </div>
        </div>
      </div>
    </>
  );
};


// ══════════════════════════════════════════════════════════════
// SIMILARES
// ══════════════════════════════════════════════════════════════
const SimilarBookCard=({r,onAddBook,T})=>{
  const [ok,setOk]=useState(true);
  return(
    <div style={{borderRadius:10,overflow:"hidden",border:`1.5px solid ${T.border}`,background:T.bgCard,transition:"all .2s",cursor:"pointer"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.lavender;e.currentTarget.style.boxShadow=`0 4px 14px ${T.lavender}40`;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.boxShadow="none";}}>
      <div style={{position:"relative",paddingBottom:"140%",background:T.lavenderLight}}>
        {ok?<img src={r.cover} alt={r.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}} onError={()=>setOk(false)}/>
           :<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:24}}>📚</span></div>}
      </div>
      <div style={{padding:"7px 8px"}}>
        <div style={{color:T.text,fontSize:10,fontWeight:700,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{r.title}</div>
        <div style={{color:T.textMuted,fontSize:9,marginTop:2}}>{r.author}</div>
        <button onClick={()=>onAddBook(r)} style={{marginTop:6,width:"100%",background:T.lavenderLight,border:"none",borderRadius:7,padding:"5px 0",color:T.lavenderDark,fontSize:10,fontWeight:700,cursor:"pointer"}}>+ Adicionar</button>
      </div>
    </div>
  );
};

const SimilarBooks=({book,onAddBook,T})=>{
  const [results,setResults]=useState([]); const [loading,setLoading]=useState(true);
  useEffect(()=>{setLoading(true);fetchSimilarBooks(book).then(r=>{setResults(r);setLoading(false);});},[book.id]);
  if(loading) return <div style={{textAlign:"center",padding:"24px 0"}}><div style={{width:28,height:28,border:`2px solid ${T.lavender}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 8px"}}/><div style={{color:T.textMuted,fontSize:12}}>Buscando similares...</div></div>;
  if(!results.length) return <div style={{color:T.textMuted,fontSize:12,textAlign:"center",padding:"16px 0"}}>Nenhum livro similar encontrado</div>;
  return(
    <div>
      <div style={{color:T.textMid,fontSize:11,fontWeight:700,marginBottom:12}}>📚 {results.length} livros similares</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
        {results.map((r,i)=><SimilarBookCard key={r.id||i} r={r} onAddBook={onAddBook} T={T}/>)}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// DETALHE DO LIVRO — Tela completa
// ══════════════════════════════════════════════════════════════
const BookDetail=({book,onEdit,onDelete,onAddBook,T})=>{
  const [tab,setTab]=useState("info");
  const [entryText,setEntryText]=useState("");
  const [entryMood,setEntryMood]=useState("📖");
  const [entryRating,setEntryRating]=useState(0);
  const [entries,setEntries]=useState(book.entries||[]);
  const [localBook,setLocalBook]=useState(book);
  useEffect(()=>{setLocalBook(book);setEntries(book.entries||[]);},[book]);
  const addEntry=()=>{
    if(!entryText.trim())return;
    setEntries(p=>[...p,{id:genId(),date:TODAY,text:entryText.trim(),mood:entryMood,rating:entryRating}]);
    setEntryText("");setEntryMood("📖");setEntryRating(0);
  };
  const speed=pagesPerDay(localBook);
  const TABS=[{id:"info",label:"📋 Info"},{id:"diario",label:"📝 Diário"},{id:"similar",label:"🔍 Similares"}];
  return(
    <div style={{minHeight:"100vh",background:T.bg,display:"flex",flexDirection:"column"}}>
      <div style={{background:T.headerBg,padding:"20px 20px 0"}}>
        <div style={{display:"flex",gap:16,alignItems:"flex-start"}}>
          <div style={{width:88,height:130,borderRadius:12,overflow:"hidden",boxShadow:"0 8px 24px rgba(0,0,0,.2)",flexShrink:0}}>
            <CoverImg book={localBook} width="88px" height="130px" radius={12} T={T}/>
          </div>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
              <StatusPill status={localBook.status} T={T}/>
              {localBook.favorite&&<span>❤️</span>}
            </div>
            <div style={{color:T.text,fontSize:17,fontWeight:900,lineHeight:1.25,marginBottom:3}}>{localBook.title}</div>
            {localBook.series&&<div style={{color:T.lavenderDark,fontSize:11,fontWeight:700,marginBottom:4}}>📚 {localBook.series}</div>}
            <div style={{color:T.textMid,fontSize:13,marginBottom:8}}>✍️ {localBook.author}</div>
            <Stars value={localBook.rating} readonly size={18}/>
            {localBook.status==="lendo"&&<div style={{marginTop:8}}><Bar value={localBook.progress} T={T}/><span style={{color:T.roseDark,fontSize:10,fontWeight:700}}>{localBook.progress}%</span></div>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,flexShrink:0}}>
            <Btn onClick={()=>onEdit(localBook)} variant="secondary" small T={T}>✏️</Btn>
            <Btn onClick={()=>{if(confirm("Remover este livro?"))onDelete(localBook.id);}} variant="danger" small T={T}>🗑️</Btn>
          </div>
        </div>
        <div style={{display:"flex",gap:8,overflowX:"auto",padding:"14px 0 0",scrollbarWidth:"none"}}>
          {[
            {label:"Páginas",value:localBook.pages||"—"},
            {label:"Ano",value:localBook.year||"—"},
            {label:"Gênero",value:localBook.genre?.[0]||"—"},
            {label:"Adicionado",value:localBook.addedAt?.split("-").reverse().join("/")||"—"},
            ...(speed?[{label:"Págs/dia",value:speed}]:[]),
            ...(localBook.finishedAt?[{label:"Finalizado",value:localBook.finishedAt.split("-").reverse().join("/")}]:[]),
          ].map((s,i)=>(
            <div key={i} style={{background:"rgba(255,255,255,.15)",borderRadius:10,padding:"6px 12px",textAlign:"center",flexShrink:0}}>
              <div style={{color:T.text,fontSize:13,fontWeight:800}}>{s.value}</div>
              <div style={{color:T.textMuted,fontSize:9}}>{s.label}</div>
            </div>
          ))}
        </div>
        <div style={{display:"flex",marginTop:14}}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"11px 0",background:"none",border:"none",cursor:"pointer",color:tab===t.id?T.roseDark:T.textMid,fontWeight:tab===t.id?800:600,fontSize:12,borderBottom:`3px solid ${tab===t.id?T.rose:"transparent"}`,transition:"all .2s",fontFamily:"inherit"}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"20px 20px 40px"}}>
        {tab==="info"&&(
          <div style={{display:"flex",flexDirection:"column",gap:16}}>
            {localBook.synopsis&&<div><div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:6}}>📖 Sinopse</div><div style={{color:T.textMid,fontSize:13,lineHeight:1.6,background:T.bgCard,borderRadius:12,padding:"12px 14px",border:`1px solid ${T.border}`}}>{localBook.synopsis}</div></div>}
            {localBook.genre?.length>0&&<div><div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:8}}>🏷️ Gêneros</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{localBook.genre.map(g=><span key={g} style={{background:T.roseLight,color:T.roseDark,fontSize:11,fontWeight:700,padding:"4px 10px",borderRadius:99}}>{g}</span>)}</div></div>}
            {localBook.tags?.length>0&&<div><div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:8}}>🔖 Tags</div><div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{localBook.tags.map(t=><span key={t} style={{background:T.butterLight,color:"#B8860B",fontSize:11,fontWeight:700,padding:"3px 9px",borderRadius:99}}>#{t}</span>)}</div></div>}
            {localBook.review&&<div><div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:6}}>💬 Minha resenha</div><div style={{color:T.textMid,fontSize:13,lineHeight:1.6,background:T.lavenderLight,borderRadius:12,padding:"12px 14px",fontStyle:"italic"}}>"{localBook.review}"</div><div style={{marginTop:6}}><Stars value={localBook.rating} readonly size={16}/></div></div>}
            {!localBook.synopsis&&!localBook.review&&<div style={{textAlign:"center",padding:"32px 0",color:T.textMuted}}><div style={{fontSize:40,marginBottom:10}}>📋</div><div style={{fontSize:13,marginBottom:16}}>Sem informações adicionais</div><Btn onClick={()=>onEdit(localBook)} variant="secondary" small T={T}>✏️ Adicionar</Btn></div>}
          </div>
        )}
        {tab==="diario"&&(
          <div>
            <div style={{background:T.bgCard,borderRadius:14,padding:16,marginBottom:20,border:`1.5px solid ${T.border}`}}>
              <div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:10}}>✍️ Nova entrada</div>
              <textarea value={entryText} onChange={e=>setEntryText(e.target.value)} placeholder="O que você está sentindo sobre este livro hoje?" rows={3}
                style={{width:"100%",background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:10,padding:"10px 12px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit",resize:"vertical",boxSizing:"border-box"}}/>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:10,flexWrap:"wrap",gap:8}}>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {MOODS.slice(0,10).map(m=><span key={m} onClick={()=>setEntryMood(m)} style={{fontSize:20,cursor:"pointer",opacity:entryMood===m?1:0.3,transition:"all .15s",transform:entryMood===m?"scale(1.3)":"scale(1)",display:"inline-block"}}>{m}</span>)}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <Stars value={entryRating} onChange={setEntryRating} size={16}/>
                  <Btn onClick={addEntry} small disabled={!entryText.trim()} T={T}>Salvar ✓</Btn>
                </div>
              </div>
            </div>
            {!entries.length
              ?<div style={{textAlign:"center",padding:"24px 0",color:T.textMuted}}><div style={{fontSize:36,marginBottom:8}}>📝</div><div style={{fontSize:13}}>Nenhuma entrada ainda</div></div>
              :<div style={{display:"flex",flexDirection:"column",gap:10}}>
                {[...entries].reverse().map(e=>(
                  <div key={e.id} style={{background:T.bgCard,borderRadius:12,padding:"12px 14px",border:`1.5px solid ${T.border}`}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:6}}>
                      <span style={{fontSize:18}}>{e.mood}</span>
                      <span style={{color:T.textMuted,fontSize:11}}>{e.date.split("-").reverse().join("/")}</span>
                      {e.rating>0&&<Stars value={e.rating} readonly size={12}/>}
                      <button onClick={()=>setEntries(p=>p.filter(x=>x.id!==e.id))} style={{marginLeft:"auto",background:"none",border:"none",color:T.textMuted,cursor:"pointer",fontSize:14}}>✕</button>
                    </div>
                    <div style={{color:T.text,fontSize:13,lineHeight:1.6}}>{e.text}</div>
                  </div>
                ))}
              </div>
            }
          </div>
        )}
        {tab==="similar"&&<SimilarBooks book={localBook} onAddBook={onAddBook} T={T}/>}
      </div>
    </div>
  );
};


// ══════════════════════════════════════════════════════════════
// DASHBOARD — Etapa 2
// ══════════════════════════════════════════════════════════════
const Dashboard=({books,goals,onNavigate,T})=>{
  const lidos=books.filter(b=>b.status==="lido");
  const lendo=books.filter(b=>b.status==="lendo");
  const queroLer=books.filter(b=>b.status==="quero ler");
  const totalPages=lidos.reduce((s,b)=>s+(b.pages||0),0);
  const avgRating=lidos.filter(b=>b.rating>0).reduce((s,b,_,a)=>s+b.rating/a.length,0);
  const thisYear=lidos.filter(b=>b.finishedAt?.startsWith(String(YEAR)));
  const pct=Math.round((thisYear.length/goals.annual)*100);

  const DC=({icon,value,label,color,onClick,sub})=>(
    <div onClick={onClick} style={{background:T.bgCard,borderRadius:16,padding:"16px 14px",border:`1.5px solid ${T.border}`,textAlign:"center",cursor:onClick?"pointer":"default",transition:"all .2s",boxShadow:`0 2px 8px rgba(0,0,0,.06)`}}
      onMouseEnter={e=>{if(onClick){e.currentTarget.style.borderColor=color;e.currentTarget.style.transform="translateY(-3px)";e.currentTarget.style.boxShadow=`0 8px 20px ${color}25`;}}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=`0 2px 8px rgba(0,0,0,.06)`;}}>
      <div style={{fontSize:26,marginBottom:4}}>{icon}</div>
      <div style={{color,fontSize:24,fontWeight:900,lineHeight:1}}>{value}</div>
      <div style={{color:T.textMuted,fontSize:11,marginTop:3}}>{label}</div>
      {sub&&<div style={{color,fontSize:10,marginTop:4,fontWeight:700}}>{sub}</div>}
    </div>
  );

  return(
    <div style={{paddingBottom:24}}>
      {/* Saudação */}
      <div style={{background:T.headerBg,borderRadius:20,padding:"20px 24px",marginBottom:20,border:`1px solid ${T.border}`}}>
        <div style={{color:T.text,fontSize:20,fontWeight:900,marginBottom:4}}>📖 Diário de Leitura</div>
        <div style={{color:T.textMid,fontSize:13,marginBottom:16}}>Acompanhe sua jornada literária ✨</div>
        {/* Meta anual */}
        <div style={{background:"rgba(255,255,255,.15)",borderRadius:12,padding:"12px 16px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{color:T.text,fontSize:13,fontWeight:700}}>🎯 Meta anual {YEAR}</span>
            <span style={{color:T.roseDark,fontSize:13,fontWeight:900}}>{thisYear.length}/{goals.annual} livros</span>
          </div>
          <Bar value={pct} color={T.rose} height={10} T={T}/>
          <div style={{color:T.textMid,fontSize:11,marginTop:6}}>{pct}% concluído · {Math.max(0,goals.annual-thisYear.length)} livros restantes</div>
        </div>
      </div>

      {/* Cards de stats */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:12}}>
        <DC icon="📚" value={books.length}    label="Total de livros"  color={T.lavenderDark} onClick={()=>onNavigate("lista",{status:"todos"})}    sub="Ver todos →"/>
        <DC icon="✓"  value={lidos.length}    label="Lidos"            color={T.mintDark}     onClick={()=>onNavigate("lista",{status:"lido"})}     sub="Ver lidos →"/>
        <DC icon="▶"  value={lendo.length}    label="Lendo agora"      color="#B8860B"        onClick={()=>onNavigate("lista",{status:"lendo"})}    sub="Ver lendo →"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        <DC icon="◎"  value={queroLer.length} label="Quero ler"        color={T.lavenderDark} onClick={()=>onNavigate("lista",{status:"quero ler"})} sub="Ver lista →"/>
        <DC icon="📄" value={totalPages.toLocaleString("pt-BR")} label="Páginas lidas" color={T.roseDark} onClick={()=>onNavigate("lista",{status:"lido"})} sub="Dos lidos"/>
        <DC icon="⭐" value={avgRating?avgRating.toFixed(1):"—"} label="Média das notas" color="#FFB300"/>
      </div>

      {/* Lendo agora */}
      {lendo.length>0&&(
        <div style={{marginBottom:20}}>
          <div style={{color:T.text,fontSize:15,fontWeight:800,marginBottom:12}}>▶ Lendo agora</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {lendo.slice(0,3).map(b=>(
              <div key={b.id} onClick={()=>onNavigate("detalhe",{book:b})} style={{background:T.bgCard,borderRadius:14,padding:"14px 16px",border:`1.5px solid ${T.border}`,display:"flex",gap:14,alignItems:"center",cursor:"pointer",transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.rose;e.currentTarget.style.transform="translateX(4px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
                <div style={{width:48,height:70,borderRadius:8,overflow:"hidden",flexShrink:0}}><CoverImg book={b} width="48px" height="70px" radius={8} T={T}/></div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:2}}>{b.title}</div>
                  <div style={{color:T.textMuted,fontSize:11,marginBottom:8}}>{b.author}</div>
                  <Bar value={b.progress} T={T} height={6}/>
                  <div style={{color:T.roseDark,fontSize:10,fontWeight:700,marginTop:4}}>{b.progress}% · {b.pages>0?`${Math.round((b.progress/100)*b.pages)}/${b.pages} pág.`:""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Últimos lidos */}
      {lidos.length>0&&(
        <div>
          <div style={{color:T.text,fontSize:15,fontWeight:800,marginBottom:12}}>✓ Últimos lidos</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(120px,1fr))",gap:12}}>
            {lidos.slice(0,6).map(b=>(
              <div key={b.id} onClick={()=>onNavigate("detalhe",{book:b})} style={{cursor:"pointer",borderRadius:12,overflow:"hidden",background:T.bgCard,border:`1.5px solid ${T.border}`,transition:"all .2s"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=T.rose;e.currentTarget.style.transform="translateY(-3px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
                <div style={{position:"relative",paddingBottom:"148%"}}><div style={{position:"absolute",inset:0}}><CoverImg book={b} width="100%" height="100%" radius={0} T={T}/></div></div>
                <div style={{padding:"8px 8px 10px"}}>
                  <div style={{color:T.text,fontSize:10,fontWeight:800,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{b.title}</div>
                  {b.rating>0&&<div style={{marginTop:4}}><Stars value={b.rating} readonly size={10}/></div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// ESTATÍSTICAS — Etapa 7
// ══════════════════════════════════════════════════════════════
const StatsView=({books,onNavigate,T})=>{
  const lidos=books.filter(b=>b.status==="lido");
  const lendo=books.filter(b=>b.status==="lendo");
  const queroLer=books.filter(b=>b.status==="quero ler");
  const pausados=books.filter(b=>b.status==="pausado");
  const totalPages=lidos.reduce((s,b)=>s+(b.pages||0),0);
  const avgRating=lidos.filter(b=>b.rating>0).reduce((s,b,_,a)=>s+b.rating/a.length,0);
  const favoritos=books.filter(b=>b.favorite);
  const genreCount={}; books.forEach(b=>(b.genre||[]).forEach(g=>{genreCount[g]=(genreCount[g]||0)+1;}));
  const topGenres=Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const authorCount={}; books.forEach(b=>{if(b.author)authorCount[b.author]=(authorCount[b.author]||0)+1;});
  const topAuthors=Object.entries(authorCount).sort((a,b)=>b[1]-a[1]).slice(0,6);
  const thisYear=lidos.filter(b=>b.finishedAt?.startsWith(String(YEAR)));

  const SC=({icon,value,label,color,onClick,sub})=>(
    <div onClick={onClick} style={{background:T.bgCard,borderRadius:16,padding:"16px 14px",border:`1.5px solid ${T.border}`,textAlign:"center",cursor:onClick?"pointer":"default",transition:"all .2s"}}
      onMouseEnter={e=>{if(onClick){e.currentTarget.style.borderColor=color;e.currentTarget.style.transform="translateY(-3px)";}}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";}}>
      <div style={{fontSize:24,marginBottom:4}}>{icon}</div>
      <div style={{color,fontSize:22,fontWeight:900}}>{value}</div>
      <div style={{color:T.textMuted,fontSize:11,marginTop:2}}>{label}</div>
      {sub&&<div style={{color,fontSize:10,marginTop:4,fontWeight:700}}>{sub}</div>}
    </div>
  );

  return(
    <div style={{paddingBottom:32}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
        <SC icon="📚" value={books.length}                       label="Total"       color={T.lavenderDark} onClick={()=>onNavigate("lista",{status:"todos"})}    sub="Ver →"/>
        <SC icon="✓"  value={lidos.length}                       label="Lidos"       color={T.mintDark}     onClick={()=>onNavigate("lista",{status:"lido"})}     sub="Ver →"/>
        <SC icon="▶"  value={lendo.length}                       label="Lendo"       color="#B8860B"        onClick={()=>onNavigate("lista",{status:"lendo"})}    sub="Ver →"/>
        <SC icon="📄" value={totalPages.toLocaleString("pt-BR")} label="Páginas"     color={T.roseDark}     onClick={()=>onNavigate("lista",{status:"lido"})}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        <SC icon="◎"  value={queroLer.length}  label="Quero ler"  color={T.lavenderDark} onClick={()=>onNavigate("lista",{status:"quero ler"})} sub="Ver →"/>
        <SC icon="⏸"  value={pausados.length}  label="Pausados"   color="#1976D2"        onClick={()=>onNavigate("lista",{status:"pausado"})}   sub="Ver →"/>
        <SC icon="❤️" value={favoritos.length} label="Favoritos"  color={T.roseDark}     onClick={()=>onNavigate("lista",{favoritos:true})}     sub="Ver →"/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
        {/* Avaliação */}
        <div style={{background:T.bgCard,borderRadius:16,padding:"18px 20px",border:`1.5px solid ${T.border}`}}>
          <div style={{color:T.text,fontSize:14,fontWeight:800,marginBottom:12}}>⭐ Avaliação média</div>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
            <div style={{color:"#FFB300",fontSize:34,fontWeight:900}}>{avgRating?avgRating.toFixed(1):"—"}</div>
            <Stars value={Math.round(avgRating)} readonly size={20}/>
          </div>
          <div style={{color:T.textMuted,fontSize:12,marginBottom:10}}>{lidos.filter(b=>b.rating>0).length} livros avaliados</div>
          {lidos.filter(b=>b.rating===5).slice(0,3).map(b=>(
            <div key={b.id} onClick={()=>onNavigate("detalhe",{book:b})} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"4px 6px",borderRadius:8,transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.roseLight}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <Stars value={5} readonly size={11}/><span style={{color:T.text,fontSize:11,fontWeight:700}}>{b.title}</span>
            </div>
          ))}
        </div>
        {/* Este ano */}
        <div style={{background:T.bgCard,borderRadius:16,padding:"18px 20px",border:`1.5px solid ${T.border}`}}>
          <div style={{color:T.text,fontSize:14,fontWeight:800,marginBottom:12}}>🗓️ Este ano ({YEAR})</div>
          <div style={{color:T.roseDark,fontSize:32,fontWeight:900,marginBottom:4}}>{thisYear.length}</div>
          <div style={{color:T.textMuted,fontSize:12,marginBottom:10}}>livros concluídos</div>
          {thisYear.slice(0,3).map(b=>(
            <div key={b.id} onClick={()=>onNavigate("detalhe",{book:b})} style={{display:"flex",alignItems:"center",gap:6,cursor:"pointer",padding:"4px 6px",borderRadius:8,transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.roseLight}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <span style={{color:T.text,fontSize:11,fontWeight:700}}>📖 {b.title}</span>
            </div>
          ))}
        </div>
        {/* Gêneros */}
        <div style={{background:T.bgCard,borderRadius:16,padding:"18px 20px",border:`1.5px solid ${T.border}`}}>
          <div style={{color:T.text,fontSize:14,fontWeight:800,marginBottom:12}}>🏷️ Gêneros mais lidos</div>
          {topGenres.map(([g,n])=>(
            <div key={g} onClick={()=>onNavigate("lista",{genre:g})} style={{marginBottom:8,cursor:"pointer",padding:"4px 6px",borderRadius:8,transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.lavenderLight}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                <span style={{color:T.text,fontSize:12}}>{g}</span><span style={{color:T.textMuted,fontSize:12}}>{n}</span>
              </div>
              <Bar value={(n/Math.max(books.length,1))*100} color={T.lavender} height={5} T={T}/>
            </div>
          ))}
        </div>
        {/* Autores */}
        <div style={{background:T.bgCard,borderRadius:16,padding:"18px 20px",border:`1.5px solid ${T.border}`}}>
          <div style={{color:T.text,fontSize:14,fontWeight:800,marginBottom:12}}>✍️ Autores favoritos</div>
          {topAuthors.map(([a,n],i)=>(
            <div key={a} onClick={()=>onNavigate("lista",{author:a})} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8,cursor:"pointer",padding:"4px 6px",borderRadius:8,transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background=T.lavenderLight}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:T.textMuted,fontSize:11,fontWeight:700,minWidth:16}}>{i+1}</span>
                <span style={{color:T.text,fontSize:12}}>{a}</span>
              </div>
              <span style={{background:T.roseLight,color:T.roseDark,fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:99}}>{n}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// METAS — Etapa 8
// ══════════════════════════════════════════════════════════════
const GoalsView=({books,goals,setGoals,T})=>{
  const lidos=books.filter(b=>b.status==="lido");
  const thisYear=lidos.filter(b=>b.finishedAt?.startsWith(String(YEAR)));
  const now=new Date(); const mes=now.getMonth();
  const thisMes=lidos.filter(b=>{const d=new Date(b.finishedAt||""); return d.getFullYear()===YEAR&&d.getMonth()===mes;});
  const startOfWeek=new Date(); startOfWeek.setDate(startOfWeek.getDate()-startOfWeek.getDay());
  const thisWeek=lidos.filter(b=>{const d=new Date(b.finishedAt||""); return d>=startOfWeek;});
  const totalPages=lidos.reduce((s,b)=>s+(b.pages||0),0);

  const GoalBar=({icon,label,current,goal,color,onChangeGoal})=>{
    const [editing,setEditing]=useState(false);
    const [val,setVal]=useState(String(goal));
    const pct=Math.min(100,Math.round((current/Math.max(goal,1))*100));
    return(
      <div style={{background:T.bgCard,borderRadius:16,padding:"18px 20px",border:`1.5px solid ${T.border}`,marginBottom:12}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:22}}>{icon}</span>
            <span style={{color:T.text,fontSize:14,fontWeight:800}}>{label}</span>
          </div>
          {editing?(
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input type="number" value={val} onChange={e=>setVal(e.target.value)} style={{width:70,background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:8,padding:"4px 8px",color:T.text,fontSize:13,outline:"none",fontFamily:"inherit"}}/>
              <button onClick={()=>{onChangeGoal(Number(val)||goal);setEditing(false);}} style={{background:T.mintLight,border:"none",borderRadius:8,padding:"4px 10px",color:T.mintDark,fontWeight:700,fontSize:12,cursor:"pointer"}}>OK</button>
            </div>
          ):(
            <button onClick={()=>setEditing(true)} style={{background:T.lavenderLight,border:"none",borderRadius:8,padding:"4px 10px",color:T.lavenderDark,fontWeight:700,fontSize:11,cursor:"pointer"}}>✏️ Meta: {goal}</button>
          )}
        </div>
        <div style={{marginBottom:8}}><Bar value={pct} color={color} height={12} T={T}/></div>
        <div style={{display:"flex",justifyContent:"space-between"}}>
          <span style={{color,fontWeight:900,fontSize:18}}>{current}/{goal}</span>
          <span style={{color:T.textMuted,fontSize:12,alignSelf:"flex-end"}}>{pct}% · {Math.max(0,goal-current)} restantes</span>
        </div>
      </div>
    );
  };

  return(
    <div style={{paddingBottom:32}}>
      <div style={{color:T.text,fontSize:18,fontWeight:900,marginBottom:4}}>🎯 Metas de Leitura</div>
      <div style={{color:T.textMuted,fontSize:13,marginBottom:20}}>Defina e acompanhe suas metas. Toque em "Meta" para editar.</div>
      <GoalBar icon="📅" label={`Meta anual ${YEAR}`} current={thisYear.length} goal={goals.annual} color={T.roseDark} onChangeGoal={v=>setGoals(g=>({...g,annual:v}))}/>
      <GoalBar icon="🗓️" label="Meta mensal" current={thisMes.length} goal={goals.monthly} color={T.lavenderDark} onChangeGoal={v=>setGoals(g=>({...g,monthly:v}))}/>
      <GoalBar icon="📆" label="Meta semanal" current={thisWeek.length} goal={goals.weekly} color={T.mintDark} onChangeGoal={v=>setGoals(g=>({...g,weekly:v}))}/>
      <GoalBar icon="📄" label="Meta de páginas" current={totalPages} goal={goals.pages} color="#B8860B" onChangeGoal={v=>setGoals(g=>({...g,pages:v}))}/>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// CONQUISTAS — Etapa 10
// ══════════════════════════════════════════════════════════════
const AchievementsView=({books,T})=>{
  return(
    <div style={{paddingBottom:32}}>
      <div style={{color:T.text,fontSize:18,fontWeight:900,marginBottom:4}}>🏆 Conquistas</div>
      <div style={{color:T.textMuted,fontSize:13,marginBottom:20}}>Medalhas desbloqueadas pela sua jornada de leitura</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(160px,1fr))",gap:14}}>
        {ACHIEVEMENTS.map(a=>{
          const unlocked=a.check(books);
          return(
            <div key={a.id} style={{background:T.bgCard,borderRadius:16,padding:"20px 16px",border:`2px solid ${unlocked?T.rose:T.border}`,textAlign:"center",opacity:unlocked?1:.5,transition:"all .3s",boxShadow:unlocked?`0 4px 16px ${T.rose}25`:"none"}}>
              <div style={{fontSize:36,marginBottom:8,filter:unlocked?"none":"grayscale(1)"}}>{a.icon}</div>
              <div style={{color:T.text,fontSize:12,fontWeight:800,marginBottom:4}}>{a.title}</div>
              <div style={{color:T.textMuted,fontSize:10,lineHeight:1.4}}>{a.desc}</div>
              {unlocked&&<div style={{marginTop:8,background:T.roseLight,color:T.roseDark,fontSize:9,fontWeight:800,padding:"3px 8px",borderRadius:99,display:"inline-block"}}>✓ Desbloqueada!</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ══════════════════════════════════════════════════════════════
// RESULTADO DE BUSCA GLOBAL
// ══════════════════════════════════════════════════════════════
const ResultBookCard=({r,added,onAddBook,T})=>{
  const [imgState,setImgState]=useState("loading");
  const [currentSrc,setCurrentSrc]=useState(null);
  const [srcIndex,setSrcIndex]=useState(0);
  const [dlLoading,setDlLoading]=useState(false);
  const [dlLinks,setDlLinks]=useState(null);
  const [showDl,setShowDl]=useState(false);
  const sources=(()=>{
    const s=[]; if(r.cover)s.push(r.cover);
    if(r.source==="GB"&&r.cover){s.push(r.cover.replace(/zoom=\d/,"zoom=1"));s.push(r.cover.replace(/zoom=\d/,"zoom=0"));}
    if(r.source==="OL"&&r.cover){s.push(r.cover.replace("-L.jpg","-M.jpg"));s.push(r.cover.replace("-L.jpg","-S.jpg"));}
    return s.filter(Boolean);
  })();
  useEffect(()=>{if(!sources.length){setImgState("err");return;}setCurrentSrc(sources[0]);setImgState("loading");setSrcIndex(0);},[r.id,r.cover]);
  const handleImgError=()=>{const next=srcIndex+1;if(next<sources.length){setSrcIndex(next);setCurrentSrc(sources[next]);}else setImgState("err");};
  const handleDownload=async(e)=>{e.stopPropagation();setDlLoading(true);setShowDl(true);const links=await findDownloadLinks(r);setDlLinks(links);setDlLoading(false);};
  const bBase={border:"none",borderRadius:9,fontSize:11,fontWeight:800,cursor:"pointer",fontFamily:"inherit",textDecoration:"none",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:4};
  return(
    <div style={{background:T.bgCard,borderRadius:14,overflow:"hidden",border:`1.5px solid ${T.border}`,display:"flex",flexDirection:"column",transition:"all .2s"}}
      onMouseEnter={e=>{e.currentTarget.style.borderColor=T.rose;e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 6px 20px ${T.rose}20`;}}
      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow="none";}}>
      <div style={{position:"relative",paddingBottom:"145%",background:T.roseLight,flexShrink:0}}>
        {imgState!=="err"&&currentSrc&&<img src={currentSrc} alt={r.title} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover",display:imgState==="loading"?"none":"block"}} onLoad={()=>setImgState("ok")} onError={handleImgError}/>}
        {imgState==="loading"&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:24,height:24,border:`2px solid ${T.rose}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite"}}/></div>}
        {imgState==="err"&&<div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",background:`linear-gradient(135deg,${T.roseLight},${T.lavenderLight})`}}><span style={{fontSize:36}}>📚</span></div>}
        <div style={{position:"absolute",top:6,right:6,background:r.source==="OL"?T.mintLight:T.lavenderLight,borderRadius:6,padding:"2px 6px"}}>
          <span style={{color:r.source==="OL"?T.mintDark:T.lavenderDark,fontSize:8,fontWeight:800}}>{r.source==="OL"?"OL":"GB"}</span>
        </div>
      </div>
      <div style={{padding:"12px 14px",flex:1,display:"flex",flexDirection:"column"}}>
        <div style={{color:T.text,fontSize:13,fontWeight:800,marginBottom:3,lineHeight:1.3,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{r.title}</div>
        <div style={{color:T.textMid,fontSize:11,marginBottom:6}}>{r.author}</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
          {r.year&&<span style={{background:T.butterLight,color:"#B8860B",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6}}>📅 {r.year}</span>}
          {r.pages>0&&<span style={{background:T.skyLight,color:"#1565C0",fontSize:9,fontWeight:700,padding:"2px 6px",borderRadius:6}}>📄 {r.pages}p</span>}
        </div>
        {r.synopsis&&<div style={{color:T.textMuted,fontSize:11,lineHeight:1.5,marginBottom:8,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",flex:1}}>{r.synopsis.slice(0,120)}...</div>}
        <div style={{display:"flex",gap:5,marginTop:"auto",paddingTop:8}}>
          {r.previewLink&&<a href={r.previewLink} target="_blank" rel="noopener noreferrer" style={{...bBase,flex:"0 0 auto",background:T.skyLight,color:"#1976D2",padding:"7px 8px"}}>👁️</a>}
          <button onClick={handleDownload} style={{...bBase,flex:1,background:`linear-gradient(135deg,${T.lavender},${T.lavenderDark})`,color:"#fff",padding:"7px 0"}}>{dlLoading?"⏳":"⬇️ Baixar"}</button>
          <button onClick={()=>!added&&onAddBook(r)} disabled={added} style={{...bBase,flex:1,background:added?T.mintLight:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:added?T.mintDark:"#fff",padding:"7px 0",cursor:added?"default":"pointer"}}>
            {added?"✓ Salvo":"+ Biblioteca"}
          </button>
        </div>
        {showDl&&(
          <div style={{marginTop:10,background:T.lavenderLight,borderRadius:12,padding:"12px 14px",border:`1.5px solid ${T.lavender}`,position:"relative"}}>
            <button onClick={()=>setShowDl(false)} style={{position:"absolute",top:6,right:8,background:"none",border:"none",cursor:"pointer",color:T.textMuted,fontSize:14}}>✕</button>
            {dlLoading&&<div style={{textAlign:"center",padding:"8px 0"}}><div style={{width:20,height:20,border:`2px solid ${T.lavenderDark}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 6px"}}/><span style={{color:T.textMuted,fontSize:11}}>Buscando em 3 fontes...</span></div>}
            {!dlLoading&&dlLinks&&(
              dlLinks.found?(
                <>
                  <div style={{color:T.lavenderDark,fontSize:11,fontWeight:800,marginBottom:8}}>✅ {dlLinks.source}</div>
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    <a href={dlLinks.read} target="_blank" rel="noopener noreferrer" style={{...bBase,background:T.bgCard,color:T.text,border:`1px solid ${T.border}`,padding:"8px 12px",borderRadius:8,fontSize:12}}>📖 Ler online</a>
                    <div style={{display:"flex",gap:5}}>
                      {dlLinks.epub&&<a href={dlLinks.epub} target="_blank" rel="noopener noreferrer" style={{...bBase,flex:1,background:T.mintLight,color:T.mintDark,border:`1px solid ${T.mint}`,padding:"7px 0",borderRadius:8,fontSize:11}}>📱 EPUB</a>}
                      {dlLinks.pdf&&<a href={dlLinks.pdf} target="_blank" rel="noopener noreferrer" style={{...bBase,flex:1,background:T.roseLight,color:T.roseDark,border:`1px solid ${T.rose}`,padding:"7px 0",borderRadius:8,fontSize:11}}>📄 PDF</a>}
                      {dlLinks.txt&&<a href={dlLinks.txt} target="_blank" rel="noopener noreferrer" style={{...bBase,flex:1,background:T.butterLight,color:"#B8860B",border:`1px solid ${T.butter}`,padding:"7px 0",borderRadius:8,fontSize:11}}>📝 TXT</a>}
                    </div>
                  </div>
                </>
              ):(
                <div style={{textAlign:"center",padding:"4px 0"}}>
                  <div style={{fontSize:22,marginBottom:6}}>😔</div>
                  <div style={{color:T.text,fontSize:12,fontWeight:700,marginBottom:4}}>Download não disponível</div>
                  <div style={{color:T.textMuted,fontSize:11}}>Este livro tem direitos autorais e não possui versão gratuita nas fontes verificadas.</div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ══════════════════════════════════════════════════════════════
// DESCOBRIR — Busca global com pesquisa avançada (Etapa 5)
// ══════════════════════════════════════════════════════════════
const GlobalSearch=({onAddBook,existingTitles,T})=>{
  const [query,setQuery]=useState("");
  const [results,setResults]=useState([]);
  const [loading,setLoading]=useState(false);
  const [searched,setSearched]=useState(false);
  const [searchBy,setSearchBy]=useState("titulo");
  const inputRef=useRef();

  const doSearch=async(q)=>{
    const term=(q||query).trim(); if(!term)return;
    setLoading(true);setSearched(true);setResults([]);
    let searchQuery=term;
    if(searchBy==="autor") searchQuery=`inauthor:${term}`;
    else if(searchBy==="genero") searchQuery=`subject:${term}`;
    else if(searchBy==="serie") searchQuery=`series:${term}`;
    setResults(await searchBooks(searchQuery));
    setLoading(false);
  };

  const FILTROS=[{id:"titulo",label:"📖 Título"},{id:"autor",label:"✍️ Autor"},{id:"genero",label:"🏷️ Gênero"},{id:"serie",label:"📚 Série"}];
  const SUGESTOES=["Dark Romance","Thamy Bastida","Dom Casmurro","Pride and Prejudice","Harry Potter","Bela Kelly"];

  return(
    <div>
      <div style={{marginBottom:20,textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:6}}>🌎</div>
        <div style={{color:T.text,fontSize:18,fontWeight:900,marginBottom:4}}>Descobrir Livros</div>
        <div style={{color:T.textMuted,fontSize:13}}>Open Library + Google Books · Download automático</div>
      </div>
      {/* Filtro de tipo de busca */}
      <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap",justifyContent:"center"}}>
        {FILTROS.map(f=>(
          <button key={f.id} onClick={()=>setSearchBy(f.id)}
            style={{background:searchBy===f.id?`linear-gradient(135deg,${T.rose},${T.roseDark})`:T.bgAlt,color:searchBy===f.id?"#fff":T.textMid,border:`1.5px solid ${searchBy===f.id?T.rose:T.border}`,borderRadius:20,padding:"6px 14px",fontSize:12,fontWeight:700,cursor:"pointer",fontFamily:"inherit",transition:"all .2s"}}>
            {f.label}
          </button>
        ))}
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16,maxWidth:600,margin:"0 auto 16px"}}>
        <input ref={inputRef} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doSearch()}
          placeholder={`Buscar por ${FILTROS.find(f=>f.id===searchBy)?.label||"título"}...`}
          style={{flex:1,background:T.bgCard,border:`2px solid ${T.rose}`,borderRadius:16,padding:"14px 18px",color:T.text,fontSize:15,outline:"none",fontFamily:"inherit"}}/>
        <button onClick={()=>doSearch()} disabled={loading}
          style={{background:loading?T.border:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:"#fff",border:"none",borderRadius:16,padding:"0 24px",fontWeight:800,fontSize:15,cursor:loading?"not-allowed":"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>
          {loading?"⏳":"🔍 Buscar"}
        </button>
      </div>
      {!searched&&(
        <div style={{textAlign:"center",marginBottom:24}}>
          <div style={{color:T.textMuted,fontSize:12,marginBottom:10,fontWeight:700}}>💡 Sugestões:</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
            {SUGESTOES.map(s=>(
              <span key={s} onClick={()=>doSearch(s)} style={{background:T.lavenderLight,color:T.lavenderDark,fontSize:12,fontWeight:700,padding:"6px 14px",borderRadius:99,cursor:"pointer"}}
                onMouseEnter={e=>{e.target.style.background=T.lavender;e.target.style.color="#fff";}}
                onMouseLeave={e=>{e.target.style.background=T.lavenderLight;e.target.style.color=T.lavenderDark;}}>
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {loading&&<div style={{textAlign:"center",padding:"48px 0"}}><div style={{width:44,height:44,border:`4px solid ${T.rose}`,borderTopColor:"transparent",borderRadius:"50%",animation:"spin .8s linear infinite",margin:"0 auto 14px"}}/><div style={{color:T.text,fontSize:14,fontWeight:700}}>Buscando livros...</div><div style={{color:T.textMuted,fontSize:12,marginTop:4}}>Open Library · Google Books</div></div>}
      {!loading&&searched&&!results.length&&<div style={{textAlign:"center",padding:"48px 0"}}><div style={{fontSize:48,marginBottom:12}}>🔍</div><div style={{color:T.text,fontSize:16,fontWeight:800,marginBottom:6}}>Nenhum livro encontrado</div><div style={{color:T.textMuted,fontSize:13}}>Tente palavras-chave diferentes</div></div>}
      {!loading&&results.length>0&&(
        <div>
          <div style={{color:T.textMuted,fontSize:12,marginBottom:16,textAlign:"center"}}>{results.length} livros encontrados</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(185px,1fr))",gap:16}}>
            {results.map((r,i)=><ResultBookCard key={r.id||i} r={r} added={existingTitles.has(r.title.toLowerCase())} onAddBook={onAddBook} T={T}/>)}
          </div>
        </div>
      )}
    </div>
  );
};


// ══════════════════════════════════════════════════════════════
// APP PRINCIPAL — Etapas 4,5,6,11 integradas
// ══════════════════════════════════════════════════════════════
export default function DiarioPage() {
  // Tema escuro/claro (Etapa 11)
  const { user, profile, logout, isAdmin } = useAuth();
  const [darkMode,setDarkMode]=useState(false);
  const T=darkMode?THEMES.dark:THEMES.light;

  const [books,setBooks]=useState(SAMPLE_BOOKS);
  const [goals,setGoals]=useState(DEFAULT_GOALS);

  // Navegação com histórico + botão voltar físico
  const [history,setHistory]=useState([{view:"home",params:{}}]);
  const current=history[history.length-1];
  const {view,params}=current;
  const canGoBack=history.length>1;
  const navigate=(v,p={})=>{setHistory(h=>[...h,{view:v,params:p}]);window.scrollTo(0,0);};
  const goBack=useCallback(()=>{setHistory(h=>h.length>1?h.slice(0,-1):h);window.scrollTo(0,0);},[]);
  const goTab=(tab)=>{setHistory([{view:tab,params:{}}]);window.scrollTo(0,0);};

  useEffect(()=>{
    window.history.pushState(null,"",window.location.href);
    const onPop=(e)=>{e.preventDefault();goBack();window.history.pushState(null,"",window.location.href);};
    window.addEventListener("popstate",onPop);
    return()=>window.removeEventListener("popstate",onPop);
  },[goBack]);

  const [showForm,setShowForm]=useState(false);
  const [editBook,setEditBook]=useState(null);

  // Filtros da biblioteca (Etapas 4,5,6)
  const [search,setSearch]=useState("");
  const [filterStatus,setFilterStatus]=useState("todos");
  const [filterGenre,setFilterGenre]=useState("todos");
  const [filterYear,setFilterYear]=useState("todos");
  const [sortBy,setSortBy]=useState("addedAt");
  const [showOnlyFav,setShowOnlyFav]=useState(false);

  const allGenres=[...new Set(books.flatMap(b=>b.genre||[]))].sort();
  const allYears=[...new Set(books.map(b=>b.year).filter(Boolean))].sort((a,b)=>b-a);

  // Filtro avançado (Etapa 5) + Ordenação (Etapa 6)
  const filtered=books.filter(b=>{
    const q=search.toLowerCase();
    const mS=!q||
      b.title.toLowerCase().includes(q)||
      b.author.toLowerCase().includes(q)||
      (b.genre||[]).some(g=>g.toLowerCase().includes(q))||
      (b.tags||[]).some(t=>t.toLowerCase().includes(q))||
      (b.series||"").toLowerCase().includes(q)||
      (b.year||"").includes(q);
    return mS&&
      (filterStatus==="todos"||b.status===filterStatus)&&
      (filterGenre==="todos"||(b.genre||[]).includes(filterGenre))&&
      (filterYear==="todos"||b.year===filterYear)&&
      (!showOnlyFav||b.favorite);
  }).sort((a,b)=>{
    if(sortBy==="title")   return a.title.localeCompare(b.title);
    if(sortBy==="author")  return (a.author||"").localeCompare(b.author||"");
    if(sortBy==="rating")  return (b.rating||0)-(a.rating||0);
    if(sortBy==="pages")   return (b.pages||0)-(a.pages||0);
    if(sortBy==="year")    return (b.year||"").localeCompare(a.year||"");
    return (b.addedAt||"").localeCompare(a.addedAt||"");
  });

  const listaFiltrada=()=>books.filter(b=>{
    if(params.status&&params.status!=="todos"&&b.status!==params.status)return false;
    if(params.genre&&!(b.genre||[]).includes(params.genre))return false;
    if(params.author&&b.author!==params.author)return false;
    if(params.favoritos&&!b.favorite)return false;
    return true;
  });

  const saveBook=(book)=>{
    setBooks(bs=>bs.some(b=>b.id===book.id)?bs.map(b=>b.id===book.id?book:b):[...bs,book]);
    setShowForm(false);setEditBook(null);
  };
  const deleteBook=(id)=>{setBooks(bs=>bs.filter(b=>b.id!==id));goBack();};
  const toggleFav=(id)=>setBooks(bs=>bs.map(b=>b.id===id?{...b,favorite:!b.favorite}:b));
  const addFromSearch=(r)=>{
    if(books.find(b=>b.title.toLowerCase()===r.title.toLowerCase())){alert("Já está na biblioteca!");return;}
    setBooks(bs=>[...bs,{id:genId(),title:r.title,author:r.author,genre:r.genre?.slice(0,2)||[],series:"",status:"quero ler",rating:0,progress:0,cover:r.cover,pages:r.pages||0,year:r.year||"",addedAt:TODAY,finishedAt:null,synopsis:r.synopsis||"",review:"",entries:[],tags:[],favorite:false}]);
  };
  const existingTitles=new Set(books.map(b=>b.title.toLowerCase()));

  const TABS=[
    {id:"home",   label:"🏠 Início"},
    {id:"biblioteca",label:"📚 Biblioteca"},
    {id:"busca",  label:"🌎 Descobrir"},
    {id:"stats",  label:"📊 Stats"},
    {id:"metas",  label:"🎯 Metas"},
    {id:"trofeus",label:"🏆 Conquistas"},
  ];
  const activeTab=TABS.find(t=>t.id===view)?.id||history.find(h=>TABS.some(t=>t.id===h.view))?.view||"home";
  const listaLabel=params.status?(params.status):params.genre?params.genre:params.author?params.author:params.favoritos?"Favoritos":"Lista";

  const STYLE=`
    @keyframes spin{to{transform:rotate(360deg)}}
    *{box-sizing:border-box}
    body{margin:0;background:${T.bg}}
    ::-webkit-scrollbar{width:5px}
    ::-webkit-scrollbar-thumb{background:${T.rose};border-radius:99px}
    input[type=range]{-webkit-appearance:none;height:4px;border-radius:99px;background:${T.border};outline:none}
    input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:${T.rose};cursor:pointer}
  `;

  // Tela de detalhe — ocupa tudo
  if(view==="detalhe"&&params.book){
    const livro=books.find(b=>b.id===params.book.id)||params.book;
    return(
      <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Segoe UI',system-ui,sans-serif"}}>
        <style>{STYLE}</style>
        {showForm&&<BookForm book={editBook} onSave={saveBook} onClose={()=>{setShowForm(false);setEditBook(null);}} T={T}/>}
        <div style={{background:T.headerBg,padding:"10px 16px",display:"flex",alignItems:"center",gap:12,position:"sticky",top:0,zIndex:100,boxShadow:`0 2px 8px rgba(0,0,0,.1)`}}>
          <button onClick={goBack} style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:12,width:40,height:40,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:T.text,fontSize:20,flexShrink:0}}>←</button>
          <div style={{color:T.text,fontSize:14,fontWeight:800,flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{livro.title}</div>
          <button onClick={()=>{setEditBook(null);setShowForm(true);}} style={{background:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:"#fff",border:"none",borderRadius:12,padding:"8px 14px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit"}}>+ Livro</button>
        </div>
        <BookDetail book={livro} onEdit={(b)=>{setEditBook(b);setShowForm(true);}} onDelete={deleteBook} onAddBook={(r)=>{addFromSearch(r);alert(`"${r.title}" adicionado! ✨`);}} T={T}/>
      </div>
    );
  }

  return(
    <div style={{minHeight:"100vh",background:T.bg,fontFamily:"'Segoe UI',system-ui,sans-serif",transition:"background .3s"}}>
      <style>{STYLE}</style>
      {showForm&&<BookForm book={editBook} onSave={saveBook} onClose={()=>{setShowForm(false);setEditBook(null);}} T={T}/>}

      {/* HEADER */}
      <div style={{background:T.headerBg,borderBottom:`1px solid ${T.border}`,position:"sticky",top:0,zIndex:100,boxShadow:`0 2px 12px rgba(0,0,0,.08)`}}>
        <div style={{maxWidth:1200,margin:"0 auto",padding:"0 16px"}}>
          {/* Linha superior: voltar / tabs / dark mode / + livro */}
          <div style={{display:"flex",alignItems:"center",gap:8,height:54}}>
            {canGoBack
              ?<button onClick={goBack} style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:12,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:T.text,fontSize:18,flexShrink:0}}>←</button>
              :<div style={{fontWeight:900,fontSize:16,color:T.text,flexShrink:0}}>📖</div>
            }
            {/* Tabs scroll */}
            <div style={{flex:1,display:"flex",gap:3,overflowX:"auto",scrollbarWidth:"none",padding:"4px 0"}}>
              {TABS.map(n=>(
                <button key={n.id} onClick={()=>goTab(n.id)}
                  style={{background:activeTab===n.id?T.bgCard:"transparent",border:`1.5px solid ${activeTab===n.id?T.rose:"transparent"}`,borderRadius:12,padding:"4px 10px",color:activeTab===n.id?T.roseDark:T.textMid,fontWeight:activeTab===n.id?800:600,fontSize:11,cursor:"pointer",transition:"all .2s",fontFamily:"inherit",whiteSpace:"nowrap",flexShrink:0}}>
                  {n.label}
                </button>
              ))}
            </div>
            {/* Tema escuro */}
            <button onClick={()=>setDarkMode(d=>!d)} style={{background:T.bgCard,border:`1.5px solid ${T.border}`,borderRadius:12,width:36,height:36,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:16,flexShrink:0}} title={darkMode?"Tema claro":"Tema escuro"}>
              {darkMode?"🌞":"🌙"}
            </button>
            <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
              <div style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,padding:"5px 10px",fontSize:11,color:T.textMid,maxWidth:100,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                {profile?.name||user?.email?.split("@")[0]||""}
              </div>
              <button onClick={logout} title="Sair" style={{background:T.bgCard,border:`1px solid ${T.border}`,borderRadius:10,width:32,height:32,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",fontSize:15,color:T.textMid}}>🚪</button>
              <button onClick={()=>{setEditBook(null);setShowForm(true);}} style={{background:`linear-gradient(135deg,${T.rose},${T.roseDark})`,color:"#fff",border:"none",borderRadius:12,padding:"7px 14px",fontWeight:800,fontSize:12,cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}}>+ Livro</button>
            </div>
          </div>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div style={{maxWidth:1200,margin:"0 auto",padding:"20px 16px 60px"}}>

        {/* HOME / DASHBOARD */}
        {view==="home"&&<Dashboard books={books} goals={goals} onNavigate={navigate} T={T}/>}

        {/* BIBLIOTECA */}
        {view==="biblioteca"&&(
          <>
            {/* Filtros avançados */}
            <div style={{background:T.bgCard,borderRadius:16,padding:"14px 16px",marginBottom:18,border:`1.5px solid ${T.border}`,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
              <SearchBar value={search} onChange={setSearch} placeholder="🔍 Título, autor, série, tag, ano..." T={T}/>
              {/* Filtro favoritos */}
              <span onClick={()=>setShowOnlyFav(f=>!f)} style={{cursor:"pointer",fontSize:22,filter:showOnlyFav?"none":"grayscale(1) opacity(.35)",transition:"all .2s",userSelect:"none"}} title="Apenas favoritos">❤️</span>
              <select value={filterStatus} onChange={e=>setFilterStatus(e.target.value)} style={{background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"8px 10px",color:T.text,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                <option value="todos">Todos os status</option>
                {STATUS_LIST.map(s=><option key={s} value={s}>{s}</option>)}
              </select>
              <select value={filterGenre} onChange={e=>setFilterGenre(e.target.value)} style={{background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"8px 10px",color:T.text,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                <option value="todos">Todos os gêneros</option>
                {allGenres.map(g=><option key={g} value={g}>{g}</option>)}
              </select>
              <select value={filterYear} onChange={e=>setFilterYear(e.target.value)} style={{background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"8px 10px",color:T.text,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                <option value="todos">Todos os anos</option>
                {allYears.map(y=><option key={y} value={y}>{y}</option>)}
              </select>
              {/* Ordenação (Etapa 6) */}
              <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={{background:T.bgAlt,border:`1.5px solid ${T.border}`,borderRadius:12,padding:"8px 10px",color:T.text,fontSize:11,fontFamily:"inherit",outline:"none"}}>
                <option value="addedAt">📅 Mais recentes</option>
                <option value="title">🔤 Nome A–Z</option>
                <option value="author">✍️ Autor A–Z</option>
                <option value="rating">⭐ Melhor nota</option>
                <option value="pages">📄 Mais páginas</option>
                <option value="year">📅 Ano</option>
              </select>
              <span style={{color:T.textMuted,fontSize:11,whiteSpace:"nowrap"}}>{filtered.length} livro(s)</span>
            </div>
            {!filtered.length
              ?<div style={{textAlign:"center",padding:"60px 0"}}>
                <div style={{fontSize:56,marginBottom:12}}>📚</div>
                <div style={{color:T.text,fontSize:17,fontWeight:800,marginBottom:6}}>Nenhum livro encontrado</div>
                <div style={{color:T.textMuted,fontSize:13,marginBottom:20}}>Mude os filtros ou adicione um novo</div>
                <Btn onClick={()=>{setEditBook(null);setShowForm(true);}} T={T}>+ Adicionar livro</Btn>
              </div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:14}}>
                {filtered.map(b=><BookCard key={b.id} book={b} onClick={(b)=>navigate("detalhe",{book:b})} onToggleFav={toggleFav} T={T}/>)}
              </div>
            }
          </>
        )}

        {/* DESCOBRIR */}
        {view==="busca"&&(
          <div style={{background:T.bgCard,borderRadius:20,padding:"24px 20px",border:`1.5px solid ${T.border}`}}>
            <GlobalSearch onAddBook={addFromSearch} existingTitles={existingTitles} T={T}/>
          </div>
        )}

        {/* ESTATÍSTICAS */}
        {view==="stats"&&<StatsView books={books} onNavigate={navigate} T={T}/>}

        {/* METAS */}
        {view==="metas"&&<GoalsView books={books} goals={goals} setGoals={setGoals} T={T}/>}

        {/* CONQUISTAS */}
        {view==="trofeus"&&<AchievementsView books={books} T={T}/>}

        {/* LISTA FILTRADA (vinda de stats/dashboard) */}
        {view==="lista"&&(
          <div>
            <div style={{color:T.textMuted,fontSize:12,marginBottom:16}}>{listaFiltrada().length} livro(s) — {listaLabel}</div>
            {!listaFiltrada().length
              ?<div style={{textAlign:"center",padding:"48px 0",color:T.textMuted}}><div style={{fontSize:48,marginBottom:10}}>📚</div><div style={{fontSize:14}}>Nenhum livro nesta categoria</div></div>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(148px,1fr))",gap:14}}>
                {listaFiltrada().map(b=><BookCard key={b.id} book={b} onClick={(b)=>navigate("detalhe",{book:b})} onToggleFav={toggleFav} T={T}/>)}
              </div>
            }
          </div>
        )}
      </div>
    </div>
  );
}
