"""Generate portable project documents from recorded content, without model calls."""
from datetime import datetime, timezone
from html import escape
from io import BytesIO
import json
import re
from zipfile import ZipFile, ZIP_DEFLATED


def document(project, record=None):
    title=project['name'];parts=[]
    if record:
        item=next((v for v in project.get('management',{}).get('versions',[]) if v['id']==record),None)
        artifact=next((v for v in project.get('management',{}).get('items',[]) if v['id']==record),None)
        if item:
            title += ' · '+item['category'].title()+' v'+str(item['number'])
            parts.append(item['content']);parts.append('Recorded '+item['at']+'\nSource messages: '+', '.join(item.get('message_ids',[])))
        elif artifact and artifact.get('artifact'):
            title += ' · '+artifact['title'];parts.extend(['# '+artifact['title'],artifact['artifact'],'## Acceptance criteria',artifact['criteria'],'Status: '+artifact['status']+'\nEvidence: '+artifact.get('evidence','Not recorded')])
        else:raise ValueError('Document or delivered artifact not found')
    else:
        parts=['# Project brief',project['brief'],'## Project status',project['status']+' · Priority '+project['priority'],
               'Schedule: '+(project.get('start_date') or 'Unscheduled')+' to '+(project.get('end_date') or 'Unscheduled')]
        plan=project.get('coordination',{}).get('plans',[])
        if plan:
            plan=plan[-1];parts.extend(['# Latest plan · '+plan['status'],plan['summary']])
            for task in plan['tasks']:parts.extend(['## '+task['title'],'Agent: '+task['owner']+'\nDeliverable: '+task['deliverable']+'\nDone means: '+task['acceptance'],'Status: '+task['status'],task.get('artifact','No artifact delivered yet.')])
        plan_items={task.get('item_id') for task in plan.get('tasks',[])} if plan else set()
        for item in project.get('management',{}).get('items',[]):
            if item['id'] not in plan_items:parts.extend(['## '+item['title'],item.get('artifact','No artifact delivered yet.'),'Acceptance criteria: '+item['criteria'],'Status: '+item['status']])
        latest={(v['category'],v.get('room','team')):v for v in project.get('management',{}).get('versions',[])}
        for (category,room),v in latest.items():parts.extend(['# '+category.title()+' · v'+str(v['number'])+' · '+room,v['content']])
        if not plan:parts.append('No coordinator plan is recorded yet.')
    return title,'\n\n'.join(parts)


def html_body(text):
    result=[]
    for line in text.splitlines():
        clean=escape(line)
        match=re.match(r'^(#{1,6})\s+(.+)$',line)
        if match:
            level=min(4,len(match[1])+1);result.append('<h'+str(level)+'>'+escape(match[2])+'</h'+str(level)+'>')
        elif line.startswith(('- ','* ')):result.append('<p class="bullet">• '+escape(line[2:])+'</p>')
        elif line.strip():result.append('<p>'+clean+'</p>')
    return ''.join(result)


def html_document(title,text,stamp):
    return ('''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'''+escape(title)+'''</title><style>
    *{box-sizing:border-box}body{margin:0;background:#f1eef8;color:#2c253c;font:14px/1.65 system-ui,sans-serif}.sheet{max-width:900px;margin:36px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 12px 60px #30204b14}header{background:#24173c;color:white;padding:44px 52px;border-bottom:6px solid #9771ee}.brand{font-size:12px;letter-spacing:3px;color:#cdbaff}h1{font-size:32px;line-height:1.2;margin:20px 0}header p{color:#d8ccea;font-size:11px}main{padding:32px 52px}h2{font-size:23px;color:#6742b1;padding-top:22px;border-top:1px solid #ece6f4}h3{font-size:18px;color:#654e81}p{white-space:pre-wrap;overflow-wrap:anywhere;margin:9px 0}.bullet{padding-left:18px}footer{padding:20px 52px;background:#f6f3fa;font-size:11px;color:#7b6a8c}@media print{body{background:white}.sheet{box-shadow:none;margin:0;border-radius:0;max-width:none}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2,h3{break-after:avoid}p{orphans:3;widows:3}@page{margin:15mm}}
    </style><body><article class="sheet"><header><div class="brand">CADF / PROJECT RECORD</div><h1>'''+escape(title)+'''</h1><p>Generated '''+escape(stamp)+''' · Private workspace copy</p></header><main>'''+html_body(text)+'''</main><footer>Generated from attributed project records. A download does not certify accuracy, completion or approval. Browser Print → Save as PDF creates a PDF copy.</footer></article></body></html>''').encode()


def docx_document(title,text,stamp):
    ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    def para(value,style='Normal'):
        value=re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]','',value)
        return '<w:p><w:pPr><w:pStyle w:val="'+style+'"/></w:pPr><w:r><w:t xml:space="preserve">'+escape(value)+'</w:t></w:r></w:p>'
    paragraphs=[para('CADF / PROJECT RECORD','Banner'),para(title,'Title'),para('Generated '+stamp+' · Private workspace copy','Subtitle')]
    for line in text.splitlines():
        if not line.strip():continue
        match=re.match(r'^(#{1,6})\s+(.+)$',line)
        paragraphs.append(para(match[2] if match else '• '+line[2:] if line.startswith(('- ','* ')) else line,'Heading1' if match and len(match[1])==1 else 'Heading2' if match else 'Normal'))
    paragraphs.append(para('Generated from attributed project records. A download does not certify completion or approval.','Subtitle'))
    doc='<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="'+ns+'"><w:body>'+''.join(paragraphs)+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>'
    styles='''<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="'''+ns+'''"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/><w:sz w:val="22"/><w:color w:val="2C253C"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="140" w:line="280" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Banner"><w:name w:val="Banner"/><w:pPr><w:shd w:fill="30204E"/><w:spacing w:before="240" w:after="320"/></w:pPr><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:rPr><w:b/><w:sz w:val="48"/><w:color w:val="6540B0"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:rPr><w:color w:val="81718E"/><w:sz w:val="18"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:spacing w:before="320"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="6540B0"/><w:sz w:val="32"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="26"/></w:rPr></w:style></w:styles>'''
    buffer=BytesIO()
    with ZipFile(buffer,'w',ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
        archive.writestr('_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        archive.writestr('word/_rels/document.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('word/document.xml',doc);archive.writestr('word/styles.xml',styles)
    return buffer.getvalue()


def generate(store,project_id,record,format):
    project=next((p for p in store['projects'] if p['id']==project_id),None)
    if not project:raise ValueError('Project not found')
    title,text=document(project,record)
    stamp=datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')
    filename='CADF-'+project_id+('-'+re.sub('[^A-Za-z0-9-]','',record) if record else '-project')
    if format=='docx':return docx_document(title,text,stamp),'application/vnd.openxmlformats-officedocument.wordprocessingml.document',filename+'.docx'
    if format=='html':return html_document(title,text,stamp),'text/html',filename+'.html'
    if format=='md':return ('# '+title+'\n\nGenerated '+stamp+'\n\n'+text).encode(),'text/markdown',filename+'.md'
    if format=='json' and not record:return json.dumps(project,indent=2).encode(),'application/json',filename+'.json'
    raise ValueError('Unsupported document format')
