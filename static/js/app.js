const state = {
  summary: null,
  houses: [],
  neighborhoods: [],
  histogram: [],
  scatter: [],
  importance: [],
  clusters: []
};

const tooltip = d3.select('body').append('div').attr('class', 'tooltip').style('opacity', 0);

const map = L.map('map', { preferCanvas: true }).setView([42.03, -93.63], 12);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

//L.marker([42.03, -93.63]).addTo(map);

let layerGroup = L.featureGroup().addTo(map);

// blue marker icon
const blueIcon = L.icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",

  iconSize: [12, 20],     // smaller pin
  iconAnchor: [6, 20],    // tip of pin
  popupAnchor: [0, -18],  // popup position
  shadowSize: [20, 20]
});

function currency(v) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

function buildQuery() {
  const params = new URLSearchParams();
  const pairs = {
    neighborhood: document.getElementById('neighborhood').value,
    metric: document.getElementById('metric').value,
    min_price: document.getElementById('minPrice').value,
    max_price: document.getElementById('maxPrice').value,
    min_year: document.getElementById('minYear').value,
    max_year: document.getElementById('maxYear').value,
    min_qual: document.getElementById('minQual').value,
  };
  Object.entries(pairs).forEach(([k, v]) => {
    if (v && v !== 'All') params.set(k, v);

  });
  return params.toString();
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) {
    console.error("API error:", url);
    return [];
  }
  return res.json();
}

function drawMetricCards() {

  console.log("drawMetricCards running");

  if (!state.summary) {
    console.log("summary not loaded yet");
    return;
  }
  const c = document.getElementById('metric-cards');
  const rf = state.summary.model_metrics.random_forest;
  c.innerHTML = `
    <div class="metric-card"><div class="label">Homes</div><div class="value">2880</div></div>
    <div class="metric-card"><div class="label">Mean Price</div><div class="value">${currency(state.summary.price_mean)}</div></div>
    <div class="metric-card"><div class="label">RF R²</div><div class="value">${rf.r2}</div></div>
    <div class="metric-card"><div class="label">RF RMSE</div><div class="value">${currency(rf.rmse)}</div></div>
  `;
}

function initControls(summary) {
  const neighborhood = document.getElementById('neighborhood');
  neighborhood.innerHTML = '<option>All</option>' + summary.neighborhoods.map(d => `<option value="${d}">${d}</option>`).join('');

  document.getElementById('minYear').value = summary.year_min;
  document.getElementById('maxYear').value = summary.year_max;
  document.getElementById('minQual').value = summary.quality_min;
}

function getColorScale(metric, values) {
  if (metric === 'Cluster') {
    return d3.scaleOrdinal(d3.schemeTableau10)
             .domain([...new Set(values)]);
  }
  if (metric === 'Residual') {
    const maxAbs = d3.max(values, d => Math.abs(d)) || 1;
    return d3.scaleSequential(d3.interpolateRdBu).domain([-maxAbs, maxAbs]);
  }
  const extent = d3.extent(values);
  return d3.scaleSequential(d3.interpolateViridis).domain(extent);
}

function updateMap() {

  // remove previous markers
  layerGroup.clearLayers();

  // determine coloring metric
  const metric = document.getElementById("metric").value;

  const values = state.houses
    .map(d => Number(d.metric))
    .filter(v => !isNaN(v));

  const color = getColorScale(metric, values);

  state.houses.forEach(d => {

    const lat = Number(d.Latitude);
    const lon = Number(d.Longitude);
    const val = Number(d.metric);

    const markerColor = isNaN(val) ? "blue" : color(val);

    const radius = isNaN(val) ? 4 : Math.max(3, Math.sqrt(val)/200);

    const marker = L.circleMarker([lat,lon],{
      //icon: blueIcon
      radius: radius,
      fillColor: markerColor,
      color: "#333",
      weight: 1,
      fillOpacity: 0.8
    });

    //marker.bindPopup(`
     // <strong>${d.Neighborhood}</strong><br>
     // Sale Price: ${currency(d.Sale_Price)}<br>
     // Predicted: ${currency(d.Predicted_Price)}<br>
     // Residual: ${currency(d.Residual)}<br>
     // Living Area: ${d.Gr_Liv_Area}<br>
     // Overall Quality: ${d.Overall_Cond}<br>
     // Year Built: ${d.Year_Built}
    //`);

       marker.bindTooltip(`
      <strong>${d.Neighborhood}</strong><br>
      Sale Price: ${currency(d.Sale_Price)}<br>
      Predicted: ${currency(d.Predicted_Price)}<br>
      Residual: ${currency(d.Residual)}<br>
      Living Area: ${d.Gr_Liv_Area}<br>
      Overall Quality: ${d.Overall_Cond}<br>
      Year Built: ${d.Year_Built}
    `,{
      direction:"top",
      offset:[0,-10]
    });

    marker.addTo(layerGroup);

    // attach tooltip events after marker is added
    marker.on("add", function () {

      const el = marker.getElement();

      d3.select(el)
        .on("mouseover", (event) => {

          const tip = `
            <strong>${d.Neighborhood}</strong><br>
            Price: ${currency(d.Sale_Price)}<br>
            Area: ${d3.format(',')(d.Gr_Liv_Area)} sqft<br>
            Quality: ${d3.format('.2f')(d.Overall_Cond)}<br>
            Year Built: ${d.Year_Built}
          `;

          showTip(event, tip);

        })
        .on("mouse leave", hideTip);

    });

  });

  console.log("Total markers:", layerGroup.getLayers().length);

  // auto zoom to visible houses
  if (layerGroup.getLayers().length > 0) {
    map.fitBounds(layerGroup.getBounds());
  }
}
function baseSvg(selector) {
  const svg = d3.select(selector);
  svg.selectAll('*').remove();
  const width = svg.node().clientWidth;
  const height = svg.node().clientHeight;
  const margin = { top: 20, right: 20, bottom: 65, left: 70 };
  const innerW = width - margin.left - margin.right;
  const innerH = height - margin.top - margin.bottom;
  const g = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
  return { svg, g, width, height, innerW, innerH, margin };
}

function drawNeighborhoodChart() {
  const data = state.neighborhoods.slice(0, 15);
  const { g, innerW, innerH } = baseSvg('#neighborhoodChart');
  const x = d3.scaleBand().domain(data.map(d => d.Neighborhood)).range([0, innerW]).padding(0.15);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.median_price)]).nice().range([innerH, 0]);

  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x)).selectAll('text')
    .attr('transform', 'rotate(-40)').style('text-anchor', 'end');
  g.append('g').call(d3.axisLeft(y).tickFormat(d => `$${d3.format(',.0f')(d)}`));

  g.selectAll('rect').data(data).enter().append('rect')
    .attr('x', d => x(d.Neighborhood)).attr('y', d => y(d.median_price))
    .attr('width', x.bandwidth()).attr('height', d => innerH - y(d.median_price))
    .attr('fill', '#5c6bc0')
    .on('mousemove', (event, d) => showTip(event, `${d.Neighborhood}<br>Median: ${currency(d.median_price)}<br>Count: ${d.n_houses}`))
    .on('mouseleave', hideTip);
}

function drawHistogram() {
  const data = state.histogram;
  const { g, innerW, innerH } = baseSvg('#histogram');
  const x = d3.scaleLinear().domain([d3.min(data, d => d.bin_start), d3.max(data, d => d.bin_end)]).range([0, innerW]);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.count)]).nice().range([innerH, 0]);
  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x).tickFormat(d => `$${d3.format(',.0f')(d)}`));
  g.append('g').call(d3.axisLeft(y));
  g.selectAll('rect').data(data).enter().append('rect')
    .attr('x', d => x(d.bin_start) + 1)
    .attr('y', d => y(d.count))
    .attr('width', d => Math.max(0, x(d.bin_end) - x(d.bin_start) - 2))
    .attr('height', d => innerH - y(d.count))
    .attr('fill', '#26a69a')
    .on('mousemove', (event, d) => showTip(event, `${currency(d.bin_start)} - ${currency(d.bin_end)}<br>Count: ${d.count}`))
    .on('mouseleave', hideTip);
}

function drawScatter() {
  const data = state.scatter;
  const { g, innerW, innerH } = baseSvg('#scatterplot');
  const x = d3.scaleLinear().domain(d3.extent(data, d => d.x)).nice().range([0, innerW]);
  const y = d3.scaleLinear().domain(d3.extent(data, d => d.y)).nice().range([innerH, 0]);
  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y).tickFormat(d => `$${d3.format(',.0f')(d)}`));
  g.selectAll('circle').data(data).enter().append('circle')
    .attr('cx', d => x(d.x)).attr('cy', d => y(d.y)).attr('r', 3.5)
    .attr('fill', '#ef5350').attr('opacity', 0.55)
    .on('mousemove', (event, d) => showTip(event, `${d.Neighborhood}<br>Living Area: ${d3.format(',')(d.x)}<br>Sale Price: ${currency(d.y)}`))
    .on('mouseleave', hideTip);
}

function drawImportance() {
  const data = state.importance.slice(0, 15).reverse();
  const { g, innerW, innerH } = baseSvg('#importanceChart');
  const y = d3.scaleBand().domain(data.map(d => d.feature)).range([innerH, 0]).padding(0.15);
  const x = d3.scaleLinear().domain([0, d3.max(data, d => d.importance)]).nice().range([0, innerW]);
  g.append('g').call(d3.axisLeft(y));
  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x));
  g.selectAll('rect').data(data).enter().append('rect')
    .attr('y', d => y(d.feature)).attr('x', 0)
    .attr('height', y.bandwidth()).attr('width', d => x(d.importance))
    .attr('fill', '#7e57c2')
    .on('mousemove', (event, d) => showTip(event, `${d.feature}<br>Importance: ${d3.format('.4f')(d.importance)}`))
    .on('mouseleave', hideTip);
}

function drawClusters() {
  const data = state.clusters;
  const { g, innerW, innerH } = baseSvg('#clusterChart');
  const x = d3.scaleBand().domain(data.map(d => String(d.Cluster))).range([0, innerW]).padding(0.2);
  const y = d3.scaleLinear().domain([0, d3.max(data, d => d.avg_price)]).nice().range([innerH, 0]);
  g.append('g').attr('transform', `translate(0,${innerH})`).call(d3.axisBottom(x));
  g.append('g').call(d3.axisLeft(y).tickFormat(d => `$${d3.format(',.0f')(d)}`));
  g.selectAll('rect').data(data).enter().append('rect')
    .attr('x', d => x(String(d.Cluster))).attr('y', d => y(d.avg_price))
    .attr('width', x.bandwidth()).attr('height', d => innerH - y(d.avg_price))
    .attr('fill', '#42a5f5')
    .on('mousemove', (event, d) => showTip(event, `Cluster ${d.Cluster}<br>Avg Price: ${currency(d.avg_price)}<br>Avg Area: ${d3.format(',')(d.avg_area)}<br>Avg Quality: ${d3.format('.2f')(d.avg_quality)}<br>Count: ${d.n_houses}`))
    .on('mouseleave', hideTip);
}

function showTip(event, html) {
  tooltip.style('opacity', 1).html(html)
    .style('left', `${event.pageX + 6}px`)
    .style('top', `${event.pageY - 14}px`);
}
function hideTip() { tooltip.style('opacity', 0); }

async function refresh() {
  console.log("REFRESH TRIGGERED");
  const q = buildQuery();
   console.log("QUERY STRING:", q);
  const suffix = q ? `?${q}` : '';
  [state.houses, state.neighborhoods, state.histogram, state.scatter, state.importance, state.clusters] = await Promise.all([
    getJSON(`/api/houses${suffix}`),
    getJSON(`/api/neighborhoods${suffix}`),
    getJSON(`/api/price_histogram${suffix}`),
    getJSON(`/api/scatter${suffix}`),
    getJSON('/api/feature_importance?top_n=20'),
    getJSON(`/api/clusters${suffix}`)
  ]);
  drawMetricCards();
  updateMap();
  drawNeighborhoodChart();
  drawHistogram();
  drawScatter();
  drawImportance();
  drawClusters();
}

async function init() {

  state.summary = await getJSON('/api/summary');

  initControls(state.summary);

  // Attach event listeners AFTER page is ready

  document.getElementById('applyBtn').addEventListener('click', refresh);
  document.getElementById('metric').addEventListener('change', refresh);

  document.getElementById('resetBtn').addEventListener('click', async () => {
    document.getElementById('neighborhood').value = 'All';
    document.getElementById('metric').value = 'Sale_Price';
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    document.getElementById('minYear').placeholder = state.summary.year_min;
    document.getElementById('maxYear').value = state.summary.year_max;
    document.getElementById('minQual').value = state.summary.quality_min;
    await refresh();
  });

  await refresh();
}

window.addEventListener('resize', () => {
  map.invalidateSize();
  drawNeighborhoodChart();
  drawHistogram();
  drawScatter();
  drawImportance();
  drawClusters();
});

init();
