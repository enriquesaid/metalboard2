// Local fixture for manual Fetch QA. No real credentials or external services.
import { createServer } from 'node:http';
const server=createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://localhost:1420');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization, X-Test, X-API-Key');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, PATCH, DELETE, OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
 res.setHeader('Content-Type','application/json');
 if(req.url==='/slow'){setTimeout(()=>res.end('{"ok":true}'),3000);return;}
 if(req.url==='/error'){res.writeHead(422);res.end('{"error":"fixture validation"}');return;}
 let body='';for await(const chunk of req)body+=chunk;
 res.end(JSON.stringify({users:[{id:1,name:'Ana'},{id:2,name:'Bia'}],method:req.method,url:req.url,body:body?JSON.parse(body):null}));
});
server.listen(1421,'127.0.0.1',()=>console.log('Fetch QA: http://127.0.0.1:1421'));
