"""Downloadable renderings of derived work items: CSV, standalone SVG charts, and a printable report."""
import csv
from datetime import date, datetime, timezone
from html import escape
from io import StringIO

import pm

PALETTE = {'TODO': '#8d83a6', 'DOING': '#4c7bf4', 'BLOCKED': '#d9534f', 'REVIEW': '#e0a030', 'DONE': '#3fa66b'}
INK, MUTED, ACCENT = '#2c253c', '#7b6a8c', '#6742b1'
CSV_FIELDS = ('id', 'type', 'title', 'state', 'owner', 'assignee_kind', 'priority', 'start_date', 'due_date',
              'estimate_days', 'depends_on', 'labels', 'description', 'criteria', 'source')


def csv_tickets(view):
    out = StringIO()
    writer = csv.writer(out)
    writer.writerow(CSV_FIELDS)
    titles = {item['id']: item['title'] for item in view['items']}
    for item in view['items']:
        row = []
        for field in CSV_FIELDS:
            value = item.get('state') if field == 'state' else item.get(field, '')
            if field == 'depends_on':
                value = '; '.join(titles.get(dep, dep) for dep in value)
            elif field == 'labels':
                value = '; '.join(value)
            value = '' if value is None else str(value)
            row.append("'" + value if value and value[0] in '=+-@\t\r' else value)  # neutralise spreadsheet formulas
        writer.writerow(row)
    return out.getvalue().encode('utf-8-sig')


def svg_wrap(width, height, title, body):
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 %d %d" width="%d" height="%d" font-family="system-ui,sans-serif">'
            '<title>%s</title><rect width="100%%" height="100%%" fill="white"/>%s</svg>' % (width, height, width, height, escape(title), body))


def clip(text, limit):
    return text if len(text) <= limit else text[:limit - 1] + '…'


def svg_gantt(view, title='Gantt'):
    rows = view['gantt']['rows']
    if not rows:
        return svg_wrap(640, 90, title, '<text x="20" y="50" fill="%s">No scheduled items yet.</text>' % MUTED)
    first, last = pm.parse_date(view['gantt']['start']), pm.parse_date(view['gantt']['end'])
    span = max(1, (last - first).days + 1)
    label_w, chart_w, row_h = 230, 760, 28
    height = 70 + row_h * len(rows)
    body = ['<text x="16" y="28" font-size="16" font-weight="700" fill="%s">%s</text>' % (INK, escape(title))]
    for tick in range(0, span, max(1, span // 10)):
        x = label_w + chart_w * tick / span
        day = pm.parse_date(view['gantt']['start'])
        label = date.fromordinal(day.toordinal() + tick).strftime('%d %b')
        body.append('<line x1="%.1f" x2="%.1f" y1="44" y2="%d" stroke="#ece6f4"/><text x="%.1f" y="40" font-size="10" fill="%s">%s</text>' % (x, x, height - 10, x + 2, MUTED, label))
    positions = {}
    for index, row in enumerate(rows):
        y = 52 + index * row_h
        begin, end = pm.parse_date(row['start']), pm.parse_date(row['due'])
        x = label_w + chart_w * (begin - first).days / span
        width = max(6, chart_w * ((end - begin).days + 1) / span)
        positions[row['id']] = (x, x + width, y + 9)
        body.append('<text x="16" y="%d" font-size="12" fill="%s">%s</text>' % (y + 13, INK, escape(clip(row['title'], 32))))
        if row['type'] == 'milestone':
            body.append('<polygon points="%.1f,%d %.1f,%d %.1f,%d %.1f,%d" fill="%s"/>' % (x, y + 9, x + 8, y + 1, x + 16, y + 9, x + 8, y + 17, ACCENT))
        else:
            body.append('<rect x="%.1f" y="%d" width="%.1f" height="18" rx="5" fill="%s"/>' % (x, y, width, PALETTE.get(row['state'], MUTED)))
            body.append('<text x="%.1f" y="%d" font-size="10" fill="white">%s</text>' % (x + 5, y + 13, escape(clip(row['owner'], max(3, int(width / 6))))))
    for row in rows:
        for dep in row['depends_on']:
            if dep in positions:
                (_, x1, y1), (x2, _, y2) = positions[dep], positions[row['id']]
                body.append('<path d="M%.1f %d H%.1f V%d" fill="none" stroke="#b9aedb" stroke-width="1.2"/>' % (x1, y1, x2 - 3, y2))
    return svg_wrap(label_w + chart_w + 20, height, title, ''.join(body))


def svg_status(view, title='Status'):
    counts = view['stats']['by_state']
    total = sum(counts.values())
    body = ['<text x="16" y="28" font-size="16" font-weight="700" fill="%s">%s</text>' % (INK, escape(title))]
    if not total:
        body.append('<text x="16" y="60" fill="%s">No items yet.</text>' % MUTED)
        return svg_wrap(420, 90, title, ''.join(body))
    y = 50
    for key, label in pm.LANES:
        width = 240 * counts[key] / total
        body.append('<text x="16" y="%d" font-size="12" fill="%s">%s</text><rect x="130" y="%d" width="%.1f" height="16" rx="4" fill="%s"/><text x="%.1f" y="%d" font-size="12" fill="%s">%d</text>'
                    % (y + 12, INK, escape(label), y, max(2, width) if counts[key] else 0, PALETTE[key], 136 + width, y + 12, INK, counts[key]))
        y += 28
    body.append('<text x="16" y="%d" font-size="12" fill="%s">%d%% complete · %d overdue</text>' % (y + 8, MUTED, view['stats']['percent'], view['stats']['overdue']))
    return svg_wrap(420, y + 24, title, ''.join(body))


def svg_workload(view, title='Workload (working days)'):
    people = sorted(view['workload'].items())
    body = ['<text x="16" y="28" font-size="16" font-weight="700" fill="%s">%s</text>' % (INK, escape(title))]
    if not people:
        body.append('<text x="16" y="60" fill="%s">No assigned work yet.</text>' % MUTED)
        return svg_wrap(520, 90, title, ''.join(body))
    peak = max(entry['open_days'] + entry['done_days'] for _, entry in people) or 1
    y = 50
    for name, entry in people:
        open_w, done_w = 300 * entry['open_days'] / peak, 300 * entry['done_days'] / peak
        body.append('<text x="16" y="%d" font-size="12" fill="%s">%s</text>' % (y + 12, INK, escape(clip(name, 20))))
        body.append('<rect x="150" y="%d" width="%.1f" height="16" fill="%s"/><rect x="%.1f" y="%d" width="%.1f" height="16" fill="%s"/>' % (y, done_w, PALETTE['DONE'], 150 + done_w, y, open_w, PALETTE['DOING']))
        body.append('<text x="%.1f" y="%d" font-size="11" fill="%s">%s open · %s done</text>' % (156 + done_w + open_w, y + 12, MUTED, entry['open_days'], entry['done_days']))
        y += 28
    return svg_wrap(620, y + 16, title, ''.join(body))


def svg_burndown(view, title='Burndown'):
    points = view['burndown']
    if len(points) < 2:
        return svg_wrap(520, 90, title, '<text x="16" y="50" fill="%s">Schedule items to see a burndown.</text>' % MUTED)
    width, height, left, top = 640, 300, 50, 50
    peak = max(point['ideal'] for point in points) or 1
    def xy(index, value):
        return left + (width - left - 20) * index / (len(points) - 1), top + (height - top - 40) * (1 - value / peak)
    ideal = ' '.join('%.1f,%.1f' % xy(i, p['ideal']) for i, p in enumerate(points))
    actual = ' '.join('%.1f,%.1f' % xy(i, p['actual']) for i, p in enumerate(points) if p['actual'] is not None)
    body = ['<text x="16" y="28" font-size="16" font-weight="700" fill="%s">%s</text>' % (INK, escape(title)),
            '<line x1="%d" x2="%d" y1="%d" y2="%d" stroke="#cfc6e4"/>' % (left, left, top, height - 40),
            '<line x1="%d" x2="%d" y1="%d" y2="%d" stroke="#cfc6e4"/>' % (left, width - 20, height - 40, height - 40),
            '<polyline points="%s" fill="none" stroke="#b9aedb" stroke-dasharray="5 4" stroke-width="2"/>' % ideal,
            '<polyline points="%s" fill="none" stroke="%s" stroke-width="2.5"/>' % (actual, ACCENT) if actual else '',
            '<text x="%d" y="%d" font-size="10" fill="%s">%s</text><text x="%d" y="%d" font-size="10" fill="%s" text-anchor="end">%s</text>' % (left, height - 22, MUTED, points[0]['date'], width - 20, height - 22, MUTED, points[-1]['date']),
            '<text x="%d" y="%d" font-size="10" fill="%s">%g d</text>' % (8, top + 4, MUTED, peak),
            '<text x="%d" y="%d" font-size="11" fill="%s">Solid: actual remaining · dashed: ideal</text>' % (left, height - 4, MUTED)]
    return svg_wrap(width, height, title, ''.join(body))


def markdown(project, view):
    stats = view['stats']
    lines = ['# ' + project['name'] + ' · work plan', '', 'Mode: ' + view['mode'] + ' · ' + str(stats['percent']) + '% complete · ' + str(stats['overdue']) + ' overdue · ' + str(stats['blocked']) + ' blocked', '',
             '| Ticket | Type | Owner | State | Priority | Start | Due | Days |', '|---|---|---|---|---|---|---|---|']
    for item in view['items']:
        lines.append('| %s | %s | %s | %s | %s | %s | %s | %s |' % (item['title'].replace('|', '/'), item['type'], item['owner'].replace('|', '/'), item['state'], item['priority'], item.get('start_date', ''), item.get('due_date', ''), item.get('estimate_days', '')))
    if view['warnings']:
        lines += ['', '## Attention'] + ['- ' + warning for warning in view['warnings']]
    return '\n'.join(lines)


def plain(project, view):
    stats = view['stats']
    lines = ['# Summary', str(stats['percent']) + '% complete · ' + str(stats['done']) + ' of ' + str(stats['total']) + ' items done · ' + str(stats['overdue']) + ' overdue · ' + str(stats['blocked']) + ' blocked', '# Tickets']
    for item in view['items']:
        lines.append('- ' + item['title'] + ' · ' + item['type'] + ' · ' + item['owner'] + ' · ' + item['state'] + ' · ' + (item.get('start_date') or 'unscheduled') + ' to ' + (item.get('due_date') or 'unscheduled'))
    lines.append('# Workload')
    for name, entry in sorted(view['workload'].items()):
        lines.append('- ' + name + ': ' + str(entry['open_days']) + ' open days, ' + str(entry['done_days']) + ' done days')
    if view['warnings']:
        lines.append('# Attention')
        lines += ['- ' + warning for warning in view['warnings']]
    return '\n'.join(lines)


def html_report(project, view):
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    charts = ''.join('<section>' + chart + '</section>' for chart in (svg_status(view), svg_gantt(view, 'Schedule'), svg_workload(view), svg_burndown(view)))
    rows = ''.join('<tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>' % tuple(escape(str(value)) for value in (item['title'], item['type'], item['owner'], item['state'], item.get('start_date', ''), item.get('due_date', ''))) for item in view['items'])
    attention = ''.join('<li>' + escape(w) + '</li>' for w in view['warnings'])
    return ('<!doctype html><html lang="en"><meta charset="utf-8"><title>%s</title><style>body{font:14px/1.5 system-ui,sans-serif;color:%s;margin:32px;max-width:1100px}h1{color:%s}table{border-collapse:collapse;width:100%%}td,th{border-bottom:1px solid #ece6f4;padding:6px 8px;text-align:left}section{margin:18px 0;overflow-x:auto}@media print{section{break-inside:avoid}}</style><body><h1>%s</h1><p>%s · %d%% complete · generated %s</p>%s<h2>Tickets</h2><table><tr><th>Title</th><th>Type</th><th>Owner</th><th>State</th><th>Start</th><th>Due</th></tr>%s</table>%s</body></html>'
            % (escape(project['name']), INK, ACCENT, escape(project['name']), escape(view['mode'].title() + ' project'), view['stats']['percent'], stamp, charts, rows, '<h2>Attention</h2><ul>' + attention + '</ul>' if attention else '')).encode()
