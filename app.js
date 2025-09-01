// 🚀 Ta clé GraphHopper
const GH_KEY = "9bba9d9d-5075-451b-b5cb-2fe753b4c638";

const map = L.map('map').setView([48.8566, 2.3522], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap'
}).addTo(map);

let carLine = null;
let truckLine = null;
let waypoints = [];
let currentWaypointIndex = 0;
let waypointMarkers = [];
let progressLine = null;

// Géocodage adresse avec Nominatim
async function geocode(address) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}`;
  const res = await fetch(url);
  const data = await res.json();

  if(data && data.length > 0) {
    const lat = parseFloat(data[0].lat);
    const lon = parseFloat(data[0].lon);
    return [lat, lon];  // renvoie bien [lat, lon] en nombres
  } else {
    throw new Error("Adresse introuvable : " + address);
  }
}


// --- Haversine distance en km ---
function distanceKm(p1,p2){
  const R=6371;
  const dLat=(p2[0]-p1[0])*Math.PI/180;
  const dLon=(p2[1]-p1[1])*Math.PI/180;
  const a=Math.sin(dLat/2)**2 + Math.cos(p1[0]*Math.PI/180)*Math.cos(p2[0]*Math.PI/180)*Math.sin(dLon/2)**2;
  const c=2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
  return R*c;
}

// --- Dessine la progression des waypoints sur la carte ---
function drawWaypointProgress(){
  waypointMarkers.forEach(m => map.removeLayer(m));
  if(progressLine) map.removeLayer(progressLine);
  waypointMarkers=[];

  waypoints.forEach((wp,i)=>{
    const color = (i < currentWaypointIndex) ? 'green' : 'red';
    const marker = L.circleMarker(wp,{color:color,radius:6}).addTo(map);
    waypointMarkers.push(marker);
  });

  progressLine = L.polyline(waypoints,{color:'orange',weight:2,dashArray:'5,5'}).addTo(map);
}

// --- Calcul itinéraires voiture + camion et détection divergences ---
async function calcRoutesWithCoords(start,end){
  const startStr=`${start[0]},${start[1]}`;
  const endStr=`${end[0]},${end[1]}`;

  document.getElementById("status").innerText="Calcul itinéraires...";

  const urlCar = `https://graphhopper.com/api/1/route?point=${startStr}&point=${endStr}&vehicle=car&locale=fr&key=${GH_KEY}&points_encoded=false`;
  const urlTruck = `https://graphhopper.com/api/1/route?point=${startStr}&point=${endStr}&vehicle=truck&locale=fr&key=${GH_KEY}&points_encoded=false`;

  try{
    const [resCar,resTruck]=await Promise.all([fetch(urlCar),fetch(urlTruck)]);
    const carData=await resCar.json();
    const truckData=await resTruck.json();

    const carCoords=carData.paths[0].points.coordinates.map(c=>[c[1],c[0]]);
    const truckCoords=truckData.paths[0].points.coordinates.map(c=>[c[1],c[0]]);

    if(carLine) map.removeLayer(carLine);
    if(truckLine) map.removeLayer(truckLine);
    carLine=L.polyline(carCoords,{color:'green',weight:4}).addTo(map);
    truckLine=L.polyline(truckCoords,{color:'blue',weight:4}).addTo(map);
    map.fitBounds(truckLine.getBounds());

    // Détection divergences
    waypoints=[];
    for(let i=0;i<truckCoords.length;i+=5){
      const truckPoint=truckCoords[i];
      const carPoint=carCoords[Math.min(i,carCoords.length-1)];
      if(distanceKm(truckPoint,carPoint)>0.5){
        waypoints.push(truckPoint);
      }
    }
    waypoints.push(truckCoords[truckCoords.length-1]);

    // Affichage liens Waze
    const ul=document.getElementById('waypoints');
    ul.innerHTML='';
    waypoints.forEach((wp,i)=>{
      const li=document.createElement('li');
      const a=document.createElement('a');
      a.href=`waze://?ll=${wp[0]},${wp[1]}&navigate=yes`;
      a.innerText=`Waypoint ${i+1}`;
      li.appendChild(a);
      ul.appendChild(li);
    });

    currentWaypointIndex=0;
    document.getElementById("wp-total").innerText = waypoints.length;
    drawWaypointProgress();
    document.getElementById("status").innerText="Itinéraire prêt ✅";

  } catch(err){
    console.error(err);
    document.getElementById("status").innerText="Erreur calcul itinéraire ❌";
  }
}

// --- Calculer depuis adresses ---
async function calcRoutesFromAddresses(){
  const startAddr=document.getElementById('start').value;
  const endAddr=document.getElementById('end').value;
  if(!startAddr || !endAddr){
    alert("Merci de saisir départ et arrivée !");
    return;
  }

  document.getElementById("status").innerText="Géocodage des adresses...";

  try{
    const start=await geocode(startAddr);
    const end=await geocode(endAddr);
    await calcRoutesWithCoords(start,end);
  } catch(err){
    console.error(err);
    document.getElementById("status").innerText="Erreur géocodage ❌";
  }
}

// --- Suivi GPS et ouverture automatique Waze ---
function startTrackingWaypoints(){
  if(!navigator.geolocation){
    alert("GPS non disponible");
    return;
  }
  if(waypoints.length===0){
    alert("Calcule d'abord l'itinéraire !");
    return;
  }

  const watchId = navigator.geolocation.watchPosition(pos=>{
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    const wp = waypoints[currentWaypointIndex];
    const dist = distanceKm([lat,lon],wp);

    // Dashboard
    document.getElementById("wp-index").innerText = currentWaypointIndex + 1;
    document.getElementById("wp-dist").innerText = dist.toFixed(2);
    const eta = (dist/60)*60;
    document.getElementById("wp-eta").innerText = eta.toFixed(0);

    drawWaypointProgress();

    if(dist<0.3){
      currentWaypointIndex++;
      if(currentWaypointIndex < waypoints.length){
        const url = `waze://?ll=${waypoints[currentWaypointIndex][0]},${waypoints[currentWaypointIndex][1]}&navigate=yes`;
        window.location.href = url;
      } else {
        alert("Trajet terminé ✅");
        navigator.geolocation.clearWatch(watchId);
      }
    }
  }, err=>console.error(err), {enableHighAccuracy:true,maximumAge:5000,timeout:5000});
}

// --- Suivi des clics affiliation ---
document.querySelectorAll('#affiliation a').forEach(link => {
  link.addEventListener('click', () => {
    console.log('Lien affilié cliqué :', link.href);
    // Ici, tu peux envoyer un événement à Google Analytics ou à ton serveur
  });
});
