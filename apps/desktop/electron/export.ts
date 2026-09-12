import { dialog,type BrowserWindow } from 'electron';
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import type { Application } from '../../../packages/domain/application';
import type { Page } from '../../../packages/shared/schemas';
export async function exportCsv(service:Application,window:BrowserWindow,input:unknown){
  service.auth.require();
  const request=z.object({kind:z.string(),query:z.record(z.string(),z.unknown()).default({})}).parse(input);
  const catalog=['customers','products','suppliers','categories'].includes(request.kind);
  const load=(page:number)=>service.execute(catalog?`${request.kind}.list`:'report.list',catalog?{...request.query,page,page_size:100}:{kind:request.kind,query:{...request.query,page,page_size:100}}) as Page;
  const result=await dialog.showSaveDialog(window,{defaultPath:`${request.kind.replace(/[^a-z_]/g,'')}.csv`,filters:[{name:'CSV',extensions:['csv']}]});
  if(result.canceled||!result.filePath)return null;
  const first=load(1);const rows=[...first.rows];
  for(let page=2;rows.length<first.total;page++){const next=load(page);if(!next.rows.length)break;rows.push(...next.rows);}
  const keys=Object.keys(rows[0]??{});
  const escape=(value:unknown)=>'"'+String(value??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';
  const csv='\uFEFF'+[keys.map(escape).join(','),...rows.map(row=>keys.map(key=>escape(row[key])).join(','))].join('\r\n');
  writeFileSync(result.filePath,csv);return result.filePath;
}
