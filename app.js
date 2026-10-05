const formatNumber = d3.format(",.0f");
const formatDecimal = d3.format(".2f");
const tooltip = d3.select("#tooltip");
const state = { selectedTeamId: null, search: "", season: null, excludeCovid: true };

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
function filteredRecords() { return allRecords.filter(record => !state.excludeCovid || record.season !== "2020-21"); }

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

function correlation(data) {
  if (data.length < 2) return null;
  const x = d3.mean(data, d => d.wins), y = d3.mean(data, d => d.attendance);
  const numerator = d3.sum(data, d => (d.wins - x) * (d.attendance - y));
  const denominator = Math.sqrt(d3.sum(data, d => (d.wins - x) ** 2) * d3.sum(data, d => (d.attendance - y) ** 2));
  return denominator ? numerator / denominator : null;
}

function chartSize(selector, minHeight) { const node = document.querySelector(selector); return { width: Math.max(300, node.clientWidth), height: minHeight }; }
function drawScatter(records) {
  const usable = records.filter(d => d.attendance !== null && (!state.search || d.name.toLowerCase().includes(state.search.toLowerCase())));
  const { width, height } = chartSize("#scatter-chart", window.innerWidth < 700 ? 330 : 410);
  const margin = { top: 18, right: 20, bottom: 54, left: 64 }, innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  d3.select("#scatter-chart").selectAll("*").remove();
  const svg = d3.select("#scatter-chart").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scaleLinear().domain([0, d3.max(usable, d => d.wins) + 2 || 1]).nice().range([0, innerWidth]);
  const y = d3.scaleLinear().domain([0, d3.max(usable, d => d.attendance) * 1.08 || 1]).nice().range([innerHeight, 0]);
  chart.append("g").attr("class", "grid").call(d3.axisLeft(y).tickSize(-innerWidth).tickFormat(""));
  chart.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).ticks(8));
  chart.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6).tickFormat(d => d3.format(",.0f")(d)));
  chart.append("text").attr("class", "axis-title").attr("x", innerWidth / 2).attr("y", innerHeight + 43).attr("text-anchor", "middle").text("Regular-season wins");
  chart.append("text").attr("class", "axis-title").attr("transform", "rotate(-90)").attr("x", -innerHeight / 2).attr("y", -45).attr("text-anchor", "middle").text("Average home attendance");
  chart.selectAll(".dot").data(usable, d => d.id).join("circle").attr("class", d => `dot ${state.selectedTeamId === d.id ? "selected" : ""}`).attr("fill", d => teamColor(d.name)).attr("cx", d => x(d.wins)).attr("cy", d => y(d.attendance)).attr("r", d => 5 + Math.sqrt(d.attendanceGames)).on("mouseenter", (event, d) => showTooltip(event, `<strong>${d.name}</strong>${d.wins} wins &middot; ${formatNumber(d.attendance)} average attendance<br>${d.attendanceGames} reported home games &middot; ${d.attendanceSource}`)).on("mousemove", (event) => showTooltip(event, tooltip.html())).on("mouseleave", hideTooltip).on("click", (_, d) => { state.selectedTeamId = d.id; drawScatter(records); drawTimeline(filteredRecords()); });
}

function drawTimeline(records) {
  const teamId = state.selectedTeamId;
  const teamName = records.find(d => d.id === teamId)?.name;
  d3.select("#timeline-title").text(teamName ? `${teamName} across seasons` : "Select a team");
  const usable = records.filter(d => d.id === teamId && d.attendance !== null).sort((a, b) => a.seasonStart - b.seasonStart);
  const { width, height } = chartSize("#timeline-chart", window.innerWidth < 700 ? 280 : 320);
  const margin = { top: 22, right: 58, bottom: 48, left: 62 }, innerWidth = width - margin.left - margin.right, innerHeight = height - margin.top - margin.bottom;
  d3.select("#timeline-chart").selectAll("*").remove();
  if (!usable.length) { d3.select("#timeline-chart").append("p").style("padding", "90px 0 0 20px").style("color", "#6d7a7e").text("Click a team in the scatterplot to see its history."); return; }
  const svg = d3.select("#timeline-chart").append("svg").attr("viewBox", `0 0 ${width} ${height}`).attr("width", "100%").attr("height", height);
  const chart = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
  const x = d3.scalePoint().domain(usable.map(d => d.season)).range([0, innerWidth]).padding(.5);
  const yAttendance = d3.scaleLinear().domain([0, d3.max(usable, d => d.attendance) * 1.1]).nice().range([innerHeight, 0]);
  const yWins = d3.scaleLinear().domain([0, 82]).range([innerHeight, 0]);
  chart.append("g").attr("class", "grid").call(d3.axisLeft(yAttendance).tickSize(-innerWidth).tickFormat(""));
  chart.append("g").attr("class", "axis").attr("transform", `translate(0,${innerHeight})`).call(d3.axisBottom(x).tickValues(usable.filter((_, i) => i % Math.ceil(usable.length / 8) === 0).map(d => d.season)));
  chart.append("g").attr("class", "axis").call(d3.axisLeft(yAttendance).ticks(5).tickFormat(d3.format(",.0f")));
  chart.append("g").attr("class", "axis").attr("transform", `translate(${innerWidth},0)`).call(d3.axisRight(yWins).ticks(5));
  chart.append("path").datum(usable).attr("class", "line-attendance").attr("stroke", teamColor(usable[0].name)).attr("d", d3.line().x(d => x(d.season)).y(d => yAttendance(d.attendance)));
  chart.append("path").datum(usable).attr("class", "line-wins").attr("d", d3.line().x(d => x(d.season)).y(d => yWins(d.wins)));
  chart.selectAll(".timeline-point").data(usable).join("circle").attr("class", "timeline-point").attr("fill", d => teamColor(d.name)).attr("cx", d => x(d.season)).attr("cy", d => yAttendance(d.attendance)).attr("r", 5).on("mouseenter", (event, d) => showTooltip(event, `<strong>${d.season}</strong>${d.wins} wins &middot; ${formatNumber(d.attendance)} average attendance<br>${d.attendanceSource}`)).on("mouseleave", hideTooltip);
  const legend = svg.append("g").attr("class", "legend").attr("transform", `translate(${margin.left},10)`);
  legend.append("line").attr("x1", 0).attr("x2", 22).attr("stroke", "#147d7b").attr("stroke-width", 3); legend.append("text").attr("x", 28).text("attendance");
  legend.append("line").attr("x1", 120).attr("x2", 142).attr("stroke", "#e66d54").attr("stroke-dasharray", "5 4").attr("stroke-width", 2); legend.append("text").attr("x", 148).text("wins");
}

let allRecords = [];
async function init() {
  const [games, annualRows, newerAttendanceText] = await Promise.all([d3.csv("data/nba_games_detail.csv"), d3.csv("data/nba_avg_attendance_2000-2015.csv"), d3.text("data/nba_avg_attendance_2016-2026.csv")]);
  allRecords = applyAnnualAttendance(buildRecords(games), annualRows, d3.csvParseRows(newerAttendanceText));
  state.season = [...new Set(allRecords.filter(d => d.attendance !== null).map(d => d.season))].sort((a, b) => d3.descending(a, b))[0];
  updateSeasonOptions();
  d3.select("#season-select").on("change", event => { state.season = event.target.value; state.selectedTeamId = null; render(); });
  d3.select("#team-filter").on("input", event => { state.search = event.target.value; state.selectedTeamId = null; render(); });
  d3.select("#exclude-covid").on("change", event => { state.excludeCovid = event.target.checked; state.selectedTeamId = null; updateSeasonOptions(); render(); });
  d3.select("#reset-button").on("click", () => { state.search = ""; state.selectedTeamId = null; state.excludeCovid = true; d3.select("#team-filter").property("value", ""); d3.select("#exclude-covid").property("checked", true); updateSeasonOptions(); render(); });
  d3.select("#data-status").text(`${games.length.toLocaleString()} games + annual attendance loaded`);
  render();
  window.addEventListener("resize", render);
}
function render() {
  const seasonRecords = filteredRecords().filter(d => d.season === state.season);
  const visible = seasonRecords.filter(d => d.attendance !== null && (!state.search || d.name.toLowerCase().includes(state.search.toLowerCase())));
  d3.select("#teams-count").text(visible.length); d3.select("#games-count").text(d3.sum(seasonRecords, d => d.games).toLocaleString()); d3.select("#league-attendance").text(visible.length ? formatNumber(d3.mean(visible, d => d.attendance)) : "--");
  const r = correlation(visible); d3.select("#correlation").text(r === null ? "--" : formatDecimal(r));
  drawScatter(seasonRecords); drawTimeline(filteredRecords());
}
function updateSeasonOptions() {
  const seasons = [...new Set(filteredRecords().filter(d => d.attendance !== null).map(d => d.season))].sort((a, b) => d3.descending(a, b));
  if (!seasons.includes(state.season)) state.season = seasons[0];
  d3.select("#season-select").selectAll("option").data(seasons).join("option").attr("value", d => d).text(d => d);
  d3.select("#season-select").property("value", state.season);
}
init().catch(error => { d3.select("#data-status").text("Could not load attendance data"); console.error(error); });