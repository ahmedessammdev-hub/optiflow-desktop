import { DatabaseSync,backup } from 'node:sqlite';
export class SQLite {
  private connection:DatabaseSync;
  constructor(file:string,options:{readonly?:boolean}={}){this.connection=new DatabaseSync(file,{readOnly:options.readonly??false,enableForeignKeyConstraints:true,allowExtension:false});}
  get open(){return this.connection.isOpen;}
  get inTransaction(){return this.connection.isTransaction;}
  exec(sql:string){return this.connection.exec(sql);}
  prepare(sql:string){return this.connection.prepare(sql);}
  dateFunction(){this.connection.function('business_date',(value,timezone)=>new Intl.DateTimeFormat('en-CA',{timeZone:String(timezone),year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(String(value))));}
  pragma(sql:string,options?:{simple?:boolean}):unknown {const rows=this.connection.prepare(`PRAGMA ${sql}`).all();return options?.simple?Object.values(rows[0]??{})[0]:rows;}
  backup(file:string){return backup(this.connection,file);}
  transaction<T>(fn:()=>T){return {immediate:()=>{this.connection.exec('BEGIN IMMEDIATE');try{const value=fn();this.connection.exec('COMMIT');return value;}catch(error){this.connection.exec('ROLLBACK');throw error;}}};}
  close(){this.connection.close();}
}
