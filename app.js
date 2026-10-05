const formatNumber = d3.format(",.0f");
const formatDecimal = d3.format(".2f");
const formatPercentage = d3.format(".1f");
const tooltip = d3.select("#tooltip");
const state = { selectedTeamId: null, search: "", season: null, excludeCovid: true, attendanceMode: "raw" };

function showTooltip(event, html) {
  tooltip.html(html).attr("aria-hidden", "false").style("opacity", 1);
  const box = tooltip.node().getBoundingClientRect();
  tooltip.style("left", `${Math.min(event.clientX + 14, window.innerWidth - box.width - 14)}px`).style("top", `${Math.max(12, event.clientY - box.height - 12)}px`);
}
function hideTooltip() { tooltip.style("opacity", 0).attr("aria-hidden", "true"); }
function seasonKey(date) { const year = date.getFullYear() - (date.getMonth() < 8 ? 1 : 0); return `${year}-${String(year + 1).slice(-2)}`; }
function teamRecord(id, name) { return { id, name, wins: 0, games: 0, attendanceTotal: 0, attendanceGames: 0 }; }
function normalizeTeamName(name) {
  const aliases = {
    Hawks: "Atlanta Hawks", Celtics: "Boston Celtics", Nets: "Brooklyn Nets", Hornets: "Charlotte Hornets",
    Bulls: "Chicago Bulls", Cavaliers: "Cleveland Cavaliers", Mavericks: "Dallas Mavericks", Nuggets: "Denver Nuggets",
    Pistons: "Detroit Pistons", Warriors: "Golden State Warriors", Rockets: "Houston Rockets", Pacers: "Indiana Pacers",
    Clippers: "LA Clippers", Lakers: "Los Angeles Lakers", Grizzlies: "Memphis Grizzlies", Heat: "Miami Heat",
    Bucks: "Milwaukee Bucks", Timberwolves: "Minnesota Timberwolves", Pelicans: "New Orleans Pelicans",
    Knicks: "New York Knicks", "NY Knicks": "New York Knicks", Thunder: "Oklahoma City Thunder", Magic: "Orlando Magic",
    "76ers": "Philadelphia 76ers", Suns: "Phoenix Suns", "Trail Blazers": "Portland Trail Blazers",
    Kings: "Sacramento Kings", Spurs: "San Antonio Spurs", Raptors: "Toronto Raptors", Jazz: "Utah Jazz",
    Wizards: "Washington Wizards"
  };
  return aliases[name] || name;
}
function teamColor(name) { return TEAM_COLORS[normalizeTeamName(name)] || "#147d7b"; }
function filteredRecords() {
  const covidSeasons = new Set(["2020-21", "2021-22"]);
  return allRecords.filter(record => !state.excludeCovid || !covidSeasons.has(record.season));
}
function metricValue(record) { return state.attendanceMode === "capacity" ? record.attendancePercentage : record.attendance; }
function metricLabel() { return state.attendanceMode === "capacity" ? "% of arena capacity" : "Average home attendance"; }
function metricFormat(value) { return state.attendanceMode === "capacity" ? `${formatPercentage(value)}%` : formatNumber(value); }
function seasonOptions() {
  return [...new Set(filteredRecords().filter(d => d.attendance !== null).map(d => d.season))]
    .sort((a, b) => d3.ascending(a, b));
}
function winsColor(wins) {
  return d3.scaleLinear().domain([20, 60]).range(["#d94841", "#2f9e44"]).clamp(true)(wins);
}

function buildRecords(games) {
  const records = new Map();
  games.filter(game => game.gameType === "Regular Season" && game.homeScore !== "" && game.awayScore !== "").forEach(game => {
    const date = new Date(game.gameDate);
    const season = seasonKey(date);
    [
      { id: game.hometeamId, name: game.hometeamName, score: +game.homeScore, opponent: +game.awayScore, home: true },
      { id: game.awayteamId, name: game.awayteamName, score: +game.awayScore, opponent: +game.homeScore, home: false }
    ].forEach(team => {
      if (!team.name) return;
      const key = `${season}|${team.id}`;
      if (!records.has(key)) records.set(key, { ...teamRecord(team.id, team.name), season, seasonStart: date.getFullYear() - (date.getMonth() < 8 ? 1 : 0) });
      const record = records.get(key);
      record.games += 1;
      record.wins += team.score > team.opponent ? 1 : 0;
      if (team.home && game.attendance !== "" && Number.isFinite(+game.attendance)) { record.attendanceTotal += +game.attendance; record.attendanceGames += 1; }
    });
  });
  return [...records.values()].map(record => ({ ...record, attendance: null, attendanceSource: null }));
}

function applyAnnualAttendance(records, annualRows, newerRows) {
  const attendance = new Map(annualRows.map(row => {
    const startingYear = +row["Starting Year"];
    const season = `${startingYear}-${String(startingYear + 1).slice(-2)}`;
    const team = normalizeTeamName(row.Team);
    return [`${season}|${team}`, { average: +row["Home: Avg Attendance"].replace(/,/g, ""), games: +row["Home: Total Games"].replace(/,/g, "") }];
  }));
  newerRows.slice(1).forEach(row => {
    const startingYear = +row[12];
    const average = +row[4].replace(/,/g, "");
    const games = +row[2].replace(/,/g, "");
    if (!row[1] || !Number.isFinite(startingYear) || !Number.isFinite(average)) return;
    const season = `${startingYear}-${String(startingYear + 1).slice(-2)}`;
    attendance.set(`${season}|${normalizeTeamName(row[1])}`, { average, games });
  });
  return records.map(record => {
    const annual = attendance.get(`${record.season}|${normalizeTeamName(record.name)}`);
    return annual ? { ...record, attendance: annual.average, attendanceGames: annual.games, attendanceSource: "annual source" } : record;
  });
}

function parseArenaRows(text) {
  const knownTeams = Object.keys(TEAM_COLORS);
  const seasonPattern = /;\s*(\d{4})\s*;\s*\d{4}\s*[^\d\s]\s*[0-9０-９]{2,4}/;
  return text.replace(/^\uFEFF/, "").trim().split(/\r?\n/).slice(1).map(line => {
    const fields = line.split(";").map(value => value.trim());
    const team = knownTeams.find(name => line.includes(name)) ||
      (line.includes("Los Angeles Clippers") ? "LA Clippers" : null);
    const capacityMatch = line.match(/(?:^|[; ])(\d{4,5})(?:;|\s*;|$)/);
    const seasonMatch = line.replace(/[０-９]/g, digit => String(digit.charCodeAt(0) - "０".charCodeAt(0))).match(seasonPattern);
    return {
      team,
      arena: fields[0] || null,
      capacity: capacityMatch ? +capacityMatch[1] : null,
      startSeason: seasonMatch ? +seasonMatch[1] : null,
      endSeason: null
    };
  }).filter(row => row.team && Number.isFinite(row.capacity));
}

function applyArenaCapacity(records, arenaRows) {
  return records.map(record => {
    const arena = arenaRows.find(row => row.team === normalizeTeamName(record.name));
    const inUsagePeriod = arena && Number.isFinite(arena.startSeason) && record.seasonStart >= arena.startSeason &&
      (!Number.isFinite(arena.endSeason) || record.seasonStart <= arena.endSeason);
    return {
      ...record,
      arena: inUsagePeriod ? arena.arena : null,
      arenaCapacity: inUsagePeriod ? arena.capacity : null,
      attendancePercentage: inUsagePeriod && record.attendance !== null ? record.attendance / arena.capacity * 100 : null
    };
  });
}

function updateArenaCoverage(records, arenaRows) {
  const attendanceRecords = records.filter(record => record.attendance !== null);
  const covered = attendanceRecords.filter(record => record.attendancePercentage !== null).length;
  const missing = d3.group(attendanceRecords.filter(record => record.attendancePercentage === null), record => normalizeTeamName(record.name));
  const gaps = [...missing].map(([team, teamRecords]) => {
    const seasons = teamRecords.map(record => record.season).sort();
    return `${team}: ${seasons.join(", ")}`;
  });
  d3.select("#arena-coverage-summary").text(`Arena capacity coverage: ${covered}/${attendanceRecords.length} team-seasons (${formatPercentage(covered / attendanceRecords.length * 100)}%)`);
  d3.select("#arena-coverage").text(gaps.length ? `Missing capacity by team and season:\n${gaps.join("\n")}` : "Every team-season with annual attendance has a valid arena capacity.");
}

function correlation(data) {
  if (data.length < 2) return null;
  const x = d3.mean(data, d => d.wins), y = d3.mean(data, metricValue);
  const numerator = d3.sum(data, d => (d.wins - x) * (metricValue(d) - y));
  const denominator = Math.sqrt(d3.sum(data, d => (d.wins - x) ** 2) * d3.sum(data, d => (metricValue(d) - y) ** 2));
  return denominator ? numerator / denominator : null;
}

function chartSize(selector, minHeight) { const node = document.querySelector(selector); return { width: Math.max(300, node.clientWidth), height: minHeight }; }
function drawScatter(records) {
  const usable = records.filter(d => metricValue(d) !== null && (!state.search || d.name.toLowerCase().includes(state.search.toLowerCase())));
  const { width, height } = chartSize("#scatter-chart", window.innerWidth < 700 ? 330 : 410);
  const margin = { top: 18, right: 20, bottom: 54, left: 64 }, innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  d3.select("#scatter-chart").selectAll("*").remove();
  const svg = d3.select("#scatter-chart").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLinear().domain([0, d3.max(usable, d => d.wins) + 2 || 1]).nice().range([0, innerWidth]);
  const yDomain = state.attendanceMode === "capacity" ? [60, 105] : [10000, 22000];
  const y = d3.scaleLinear().domain(yDomain).range([innerHeight, 0]);
  chart.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));
  chart.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(8));
  chart.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(d => state.attendanceMode === "capacity" ? `${d3.format(".0f")(d)}%` : d3.format(",.0f")(d)));
  chart.append("text").attr("class", "axis-title").attr("x", innerWidth / 2).attr("y", innerHeight + 43).attr("text-anchor", "middle").text("Regular-season wins");
  chart.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -45).attr("text-anchor", "middle").text(metricLabel());
  chart.selectAll(".dot").data(usable, d => d.id).join("circle").attr("class", d => `dot ${state.selectedTeamId === d.id ? "selected" : ""}`).attr("fill", d => teamColor(d.name)).attr("cx", d => x(d.wins)).attr("cy", d => y(metricValue(d))).attr("r", d => 5 + Math.sqrt(d.attendanceGames)).on("mouseenter", (event, d) => showTooltip(event, `<strong>${d.name}</strong>${d.wins} wins &middot; ${metricFormat(metricValue(d))}${state.attendanceMode === "capacity" ? " of arena capacity" : " average attendance"}<br>${formatNumber(d.attendance)} raw average attendance${d.arenaCapacity ? `<br>${d.arena} capacity: ${formatNumber(d.arenaCapacity)}` : "<br>No arena capacity available for this season"}`)).on("mousemove", (event) => showTooltip(event, tooltip.html())).on("mouseleave", hideTooltip).on("click", (_, d) => { state.selectedTeamId = d.id; drawScatter(records); drawTimeline(filteredRecords()); });
}

function drawTimeline(records) {
  const teamId = state.selectedTeamId;
  const teamName = records.find(d => d.id === teamId)?.name;
  d3.select("#timeline-title").text(teamName ? `${teamName} across seasons` : "Select a team");
  const usable = records.filter(d => d.id === teamId && metricValue(d) !== null).sort((a, b) => a.seasonStart - b.seasonStart);
  const { width, height } = chartSize("#timeline-chart", window.innerWidth < 700 ? 280 : 320);
  const margin = { top: 34, right: 20, bottom: 64, left: 62 }, innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  d3.select("#timeline-chart").selectAll("*").remove();
  if (!usable.length) { d3.select("#timeline-chart").append("p").style("padding", "90px 0 0 20px").style("color", "#6d7a7e").text("Click a team in the scatterplot to see its history."); return; }
  const svg = d3.select("#timeline-chart").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scaleBand().domain(usable.map(d => d.season)).range([0, innerWidth]).padding(.16);
  const yAttendance = d3.scaleLinear().domain([0, d3.max(usable, metricValue) * 1.1]).nice().range([innerHeight, 0]);
  chart.append("g").attr("class", "grid").call(d3.axisLeft(yAttendance).tickSize(-innerWidth).tickFormat(""));
  chart.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickValues(usable.filter((_, i) => i % Math.ceil(usable.length / 8) === 0).map(d => d.season)));
  chart.append("g").attr("class", "axis").call(d3.axisLeft(yAttendance).ticks(5).tickFormat(d => state.attendanceMode === "capacity" ? `${d3.format(".0f")(d)}%` : d3.format(",.0f")(d)));
  chart.selectAll(".timeline-bar").data(usable).join("rect").attr("class", "timeline-bar")
    .attr("x", d => x(d.season)).attr("y", d => yAttendance(metricValue(d)))
    .attr("width", x.bandwidth()).attr("height", d => innerHeight - yAttendance(metricValue(d)))
    .attr("fill", d => winsColor(d.wins))
    .on("mouseenter", (event, d) => showTooltip(event, `<strong>${d.season}</strong>${d.wins} wins &middot; ${metricFormat(metricValue(d))}<br>${formatNumber(d.attendance)} raw average attendance${d.arenaCapacity ? `<br>${d.arena} capacity: ${formatNumber(d.arenaCapacity)}` : "<br>No arena capacity available for this season"}`))
    .on("mouseleave", hideTooltip);
  const legend = svg.append("g").attr("class", "wins-legend").attr("transform", `translate(${margin.left},10)`);
  const gradient = d3.scaleLinear().domain([20, 60]).range(["#d94841", "#2f9e44"]);
  legend.append("rect").attr("x", 0).attr("y", 0).attr("width", 130).attr("height", 8).attr("fill", "url(#wins-gradient)");
  const defs = svg.append("defs");
  const linearGradient = defs.append("linearGradient").attr("id", "wins-gradient");
  linearGradient.append("stop").attr("offset", "0%").attr("stop-color", gradient(20));
  linearGradient.append("stop").attr("offset", "100%").attr("stop-color", gradient(60));
  legend.append("text").attr("x", 0).attr("y", 22).text("20 wins");
  legend.append("text").attr("x", 130).attr("y", 22).attr("text-anchor", "end").text("60+ wins");
}

let allRecords = [];
async function init() {
  const [games, annualRows, newerAttendanceText, arenaText] = await Promise.all([d3.csv("data/nba_games_detail.csv"), d3.csv("data/nba_avg_attendance_2000-2015.csv"), d3.text("data/nba_avg_attendance_2016-2026.csv"), d3.text("data/current_arenas.csv")]);
  allRecords = applyArenaCapacity(applyAnnualAttendance(buildRecords(games), annualRows, d3.csvParseRows(newerAttendanceText)), parseArenaRows(arenaText));
  updateArenaCoverage(allRecords, parseArenaRows(arenaText));
  state.season = [...new Set(allRecords.filter(d => d.attendance !== null).map(d => d.season))].sort((a, b) => d3.descending(a, b))[0];
  updateSeasonOptions();
  d3.select("#season-select").on("change", event => { state.season = event.target.value; state.selectedTeamId = null; render(); });
  d3.select("#season-slider").on("input", event => {
    state.season = seasonOptions()[+event.target.value];
    state.selectedTeamId = null;
    d3.select("#season-select").property("value", state.season);
    render();
  });
  d3.select("#team-filter").on("input", event => { state.search = event.target.value; state.selectedTeamId = null; render(); });
  d3.select("#attendance-mode").on("change", event => { state.attendanceMode = event.target.value; render(); });
  d3.select("#exclude-covid").on("change", event => { state.excludeCovid = event.target.checked; state.selectedTeamId = null; updateSeasonOptions(); render(); });
  d3.select("#reset-button").on("click", () => { state.search = ""; state.selectedTeamId = null; state.excludeCovid = true; state.attendanceMode = "raw"; d3.select("#team-filter").property("value", ""); d3.select("#exclude-covid").property("checked", true); d3.select("#attendance-mode").property("value", "raw"); updateSeasonOptions(); render(); });
  d3.select("#data-status").text(`${games.length.toLocaleString()} games + annual attendance loaded`);
  render();
  window.addEventListener("resize", render);
}
function render() {
  const seasonRecords = filteredRecords().filter(d => d.season === state.season);
  const visible = seasonRecords.filter(d => metricValue(d) !== null && (!state.search || d.name.toLowerCase().includes(state.search.toLowerCase())));
  d3.select("#teams-count").text(visible.length); d3.select("#games-count").text(d3.sum(seasonRecords, d => d.games).toLocaleString()); d3.select("#league-attendance").text(visible.length ? metricFormat(d3.mean(visible, metricValue)) : "--"); d3.select("#attendance-metric-label").text(metricLabel());
  const r = correlation(visible); d3.select("#correlation").text(r === null ? "--" : formatDecimal(r));
  updateSeasonSlider();
  drawScatter(seasonRecords); drawTimeline(filteredRecords());
}
function updateSeasonOptions() {
  const seasons = [...new Set(filteredRecords().filter(d => d.attendance !== null).map(d => d.season))].sort((a, b) => d3.descending(a, b));
  if (!seasons.includes(state.season)) state.season = seasons[0];
  d3.select("#season-select").selectAll("option").data(seasons).join("option").attr("value", d => d).text(d => d);
  d3.select("#season-select").property("value", state.season);
}
function updateSeasonSlider() {
  const seasons = seasonOptions();
  const index = Math.max(0, seasons.indexOf(state.season));
  d3.select("#season-slider").attr("max", Math.max(0, seasons.length - 1)).property("value", index);
  d3.select("#season-slider-value").text(state.season || "--");
}
init().catch(error => { d3.select("#data-status").text("Could not load attendance data"); console.error(error); });