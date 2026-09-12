import type { Prescription } from '../shared/schemas';
export function PrescriptionView({prescription,language='en',mode='full'}:{prescription:Prescription;language?:string;mode?:'compact'|'full'|'print'}){
  const ar=language==='ar';return <section className={`prescription prescription-${mode}`} dir={ar?'rtl':'ltr'}>
    <div className="section-heading"><strong>{ar?'الوصفة الطبية':'Optical prescription'}</strong><span>{ar?'تاريخ الفحص':'Exam date'}: {prescription.exam_date??(ar?'غير معروف':'Unknown')}</span></div>
    <table><thead><tr><th>{ar?'العين':'Eye'}</th>{['SPH','CYL','AXIS','ADD','PD'].map(f=><th key={f}>{f}</th>)}</tr></thead><tbody>{(['od','os'] as const).map(eye=><tr key={eye}><th>{eye==='od'?(ar?'OD / اليمنى':'OD / Right'):(ar?'OS / اليسرى':'OS / Left')}</th>{(['sph','cyl','axis','add','pd'] as const).map(field=><td key={field} dir="ltr">{prescription[eye][field]??'—'}</td>)}</tr>)}</tbody></table>
    <div className="prescription-footer"><span>IPD: <b dir="ltr">{prescription.ipd??'—'}</b></span><span>{ar?'المسافة القريبة':'Near PD'}: {prescription.near_pd??'—'}</span></div>
    {mode!=='compact'&&<><p>{prescription.doctor_name||prescription.optometrist_name}</p><p>{prescription.notes}</p><small>{ar?'سجلت في':'Recorded'}: {prescription.created_at}</small></>}
  </section>;
}
