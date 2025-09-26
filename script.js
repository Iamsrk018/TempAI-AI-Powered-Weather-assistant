// ===== Config =====
const API_KEY = 'df895c75a3a96993fbcd35eda438e955'; // put your OpenWeather key or leave blank for mock
const API_URL = 'https://api.openweathermap.org/data/2.5/weather';
const IP_URL = 'https://ipapi.co/json/';
const GEMINI_API_KEY = 'AIzaSyCa-ETMm5ttCJArsWlusM0_JXWQh2hLsVM'; // put your Gemini API key here
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

// Map OpenWeather icon code -> emoji
const ICONS = { 
  '01d':'☀️','01n':'🌙','02d':'⛅','02n':'☁️','03d':'☁️','03n':'☁️',
  '04d':'☁️','04n':'☁️','09d':'🌧️','09n':'🌧️','10d':'🌦️','10n':'🌧️',
  '11d':'⛈️','11n':'⛈️','13d':'❄️','13n':'❄️','50d':'🌫️','50n':'🌫️' 
};

// ===== DOM =====
const el = id => document.getElementById(id);
const loading = el('loading');
const errorBox = el('error');
const errorText = el('errorText');
const weather = el('weather');
const place = el('place');
const icon = el('icon');
const temp = el('temp');
const desc = el('desc');
const feels = el('feels');
const hum = el('hum');
const wind = el('wind');
const vis = el('vis');
const press = el('press');
const cloud = el('cloud');

// Weather buttons
el('retryBtn').onclick = () => start();
el('manualBtn').onclick = () => manualCity();
el('refreshBtn').onclick = () => start();
el('cityBtn').onclick = () => manualCity();

document.addEventListener('DOMContentLoaded', start);

// ===== Weather logic =====
function start(){
  show(loading); hide(errorBox); hide(weather);
  if (!secureOK()) {
    setLoading('Using IP location (HTTPS required for GPS)…');
    return ipFallback();
  }
  if (!('geolocation' in navigator)) return ipFallback();
  setLoading('Requesting GPS…');
  navigator.geolocation.getCurrentPosition(gotPos, geoErr, {
    enableHighAccuracy:false,
    timeout:15000,
    maximumAge:600000
  });
}

function secureOK(){
  return location.protocol === 'https:' || ['localhost','127.0.0.1'].includes(location.hostname);
}

function gotPos(pos){
  const {latitude:lat, longitude:lon} = pos.coords;
  fetchWeather(lat, lon);
}

function geoErr(err){
  console.warn('Geo error', err);
  ipFallback();
}

async function ipFallback(){
  try{
    const res = await fetch(IP_URL);
    if(!res.ok) throw new Error('ip fail');
    const j = await res.json();
    if(!j.latitude || !j.longitude) throw new Error('no lat/lon');
    fetchWeather(j.latitude, j.longitude, `${j.city}, ${j.country_name}`);
  }catch(e){
    console.warn('IP fallback failed', e);
    showError('Could not determine location. Use manual city.');
  }
}

async function fetchWeather(lat, lon, label=null){
  try{
    setLoading('Fetching weather…');
    if(!API_KEY){
      return setTimeout(()=>render(mock(label)), 600);
    }
    const url = `${API_URL}?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`;
    const r = await fetch(url);
    if(!r.ok) throw new Error('weather http '+r.status);
    const data = await r.json();
    render(data);
  }catch(e){
    console.error('Weather fetch failed:', e);
    render(mock(label));
  }
}

function render(data){
  hide(loading); hide(errorBox); show(weather);
  place.textContent = `📍 ${data.name}, ${data.sys?.country ?? ''}`.trim();
  const code = data.weather?.[0]?.icon || '02d';
  icon.textContent = ICONS[code] || '⛅';
  temp.textContent = `${Math.round(data.main.temp)}°C`;
  desc.textContent = data.weather?.[0]?.description || '—';
  feels.textContent = `${Math.round(data.main.feels_like)}°C`;
  hum.textContent = `${data.main.humidity}%`;
  wind.textContent = `${(data.wind.speed*3.6).toFixed(1)} km/h`;
  vis.textContent = `${(data.visibility/1000).toFixed(1)} km`;
  press.textContent = `${data.main.pressure} hPa`;
  cloud.textContent = `${data.clouds.all}%`;
}

function showError(msg){
  hide(loading); hide(weather); show(errorBox);
  errorText.textContent = msg;
}

function setLoading(msg){
  show(loading); hide(errorBox); hide(weather);
  loading.querySelector('p').textContent = msg;
}

function show(elm){ elm.removeAttribute('hidden'); }
function hide(elm){ elm.setAttribute('hidden',''); }

async function manualCity(){
  const city = prompt('Enter city name:');
  if(!city) return;
  try{
    setLoading(`Searching ${city}…`);
    if(!API_KEY) return render(mock(city));
    const url = `${API_URL}?q=${encodeURIComponent(city)}&appid=${API_KEY}&units=metric`;
    const r = await fetch(url);
    if(!r.ok) throw new Error('city not found');
    const data = await r.json();
    render(data);
  }catch(e){
    showError('City not found. Try again.');
  }
}

function mock(name){
  return {
    name: (typeof name==='string' ? name.split(',')[0] : 'Your City'),
    sys: { country: 'IN' },
    weather: [{ description:'clear sky', icon:'01d'}],
    main: { temp: 28, feels_like: 31, humidity: 60, pressure: 1012 },
    wind: { speed: 3.2 }, visibility: 9000, clouds: { all: 12 }
  };
}

// Auto-refresh every 10 minutes
setInterval(start, 600000);

// ===== Chatbot logic =====
const chatToggle = document.getElementById('chatToggle');
const chatbot = document.getElementById('chatbot');
const closeChat = document.getElementById('closeChat');
const chatForm = document.getElementById('chatForm');
const chatText = document.getElementById('chatText');
const chatMessages = document.getElementById('chatMessages');

chatToggle.addEventListener('click', () => {
  chatbot.hidden = !chatbot.hidden;
  if (!chatbot.hidden) chatText.focus();
});
closeChat.addEventListener('click', () => chatbot.hidden = true);

chatForm.addEventListener('submit', async e => {
  e.preventDefault();
  const msg = chatText.value.trim();
  if (!msg) return;
  appendMsg('user', msg);
  chatText.value = '';

  const typingEl = appendTyping();
  const temperature = temp.textContent || '--°C';
  const promptText = `Based on the current temperature ${temperature} ${msg}`;

  try {
    if(!GEMINI_API_KEY){
      await new Promise(r=>setTimeout(r,800));
      typingEl.remove();
      appendMsg('bot','🤖 Dummy AI reply: "'+msg+'"');
      return;
    }
    const res = await fetch(GEMINI_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({contents:[{parts:[{text:promptText}]}]})
    });
    const json = await res.json();
    typingEl.remove();
    let botText = '🤖 Sorry, no response.';
    if(json?.candidates?.[0]?.content?.parts?.[0]?.text){
      botText = json.candidates[0].content.parts[0].text;
    }
    appendMsg('bot', botText);
  } catch(err){
    typingEl.remove();
    appendMsg('bot','🤖 Error fetching AI response.');
  }
});

function appendMsg(type,text){
  const div = document.createElement('div');
  div.className = type==='bot'?'bot-msg':'user-msg';
  div.textContent = text;
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function appendTyping(){
  const div = document.createElement('div');
  div.className = 'typing';
  div.textContent = 'Assistant is typing…';
  chatMessages.appendChild(div);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return div;
}

