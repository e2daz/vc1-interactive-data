# vc1-interactive-data
VC1 Praktika 3: Interaktive Darstellung von Daten

## Interactive visualization

Open `index.html` through a local web server to explore the D3 visualization:

```powershell
python -m http.server 8000
```

Then visit `http://localhost:8000`.

The main view is a season-level scatterplot: each dot is a team, with regular-season wins on the x-axis and annual average home attendance on the y-axis. This is the clearest view for correlation because both variables are quantitative and are summarized at the same team-season level. Click a dot to reveal that team's history in the linked timeline below, or use the season selector and team search.

Wins are derived from regular-season scores in `data/nba_games_detail.csv`. Attendance comes from `data/nba_avg_attendance_2000-2015.csv` (`Home: Avg Attendance`) for 2000-01 through 2015-16, plus `data/nba_avg_attendance_2016-2026.csv` for 2016-17 through 2025-26. The newer file has duplicate column names, so the first `AVG` column is parsed by position as home average attendance. Team names are normalized to the full names in `team-colors.js`, which supplies the team colors used in both charts. Seasons without an annual attendance value are omitted instead of using the game-level attendance calculation.

The attendance scale control can switch the main graph between raw average attendance and attendance as a percentage of arena capacity. Capacity is only applied from the arena's `Season of first NBA game` onward; no current arena is assumed to represent earlier seasons. The app reports the exact team-season coverage and lists missing team-seasons in the expandable arena-capacity note below the graph. Add historical arenas to `data/current_arenas.csv` using the same team, arena, start-season, end-season, and capacity concepts to extend that coverage.

The relationship chart also has a season slider synchronized with the season dropdown. The long-view chart uses attendance bars, with a red-to-green color scale for wins: 20 wins or fewer is red and 60 wins or more is green.

The `Exclude 2020-21 and 2021-22 COVID seasons` filter is enabled by default and removes both seasons from the selector, season slider, summary, scatterplot, and team timeline. Uncheck it to include both seasons.
