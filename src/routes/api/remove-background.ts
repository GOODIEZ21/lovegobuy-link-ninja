import { createFileRoute } from '@tanstack/react-router';
import { editImage } from '@/lib/image-gateway.server';
export const Route = createFileRoute('/api/remove-background')({server:{handlers:{POST:async({request})=>{
 const { verifyToken }=await import('@/lib/session.server');
 const token=request.headers.get('Authorization')?.replace(/^Bearer /,'')??'';
 if (!(await verifyToken(token))) return Response.json({error:{message:'Zaloguj się do panelu, aby usunąć tło.'}},{status:401});
 const { supabaseAdmin }=await import('@/integrations/supabase/client.server');
 const {data:block}=await supabaseAdmin.from('ai_access_blocks').select('message,status').eq('feature','remove-background').maybeSingle();
 if(block)return Response.json({error:{message:block.message}},{status:block.status});
 const key=process.env['LOVABLE_API_KEY'];
 if(!key)return Response.json({error:{message:'Usuwanie tła nie jest skonfigurowane.'}},{status:500});
 const form=await request.formData();const file=form.get('image');
 if(!(file instanceof File)||!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>10*1024*1024)return Response.json({error:{message:'Wybierz zdjęcie PNG, JPG lub WebP do 10 MB.'}},{status:400});
 const clean=new FormData();clean.set('image',file);clean.set('prompt','Remove only the background from the uploaded product photo. Output an accurately isolated product on a fully transparent background. Preserve exactly the product shape, silhouette, thin edges, fabric texture, colors, visible text, labels, logos, lighting and camera angle. Do not redesign, redraw, beautify or add anything. Retain all parts of the product and remove surrounding objects and floor.');clean.set('background','transparent');clean.set('output_format','png');clean.set('quality','high');clean.set('stream',form.get('stream')==='false'?'false':'true');
 const upstream=await editImage({baseURL:'https://ai.gateway.lovable.dev',model:'openai/gpt-image-2.5-sunburst',format:'openai',apiKey:key},clean);
 if(upstream.status===402||upstream.status===403){const err=await upstream.json().catch(()=>({message:'Dostęp do usuwania tła został wstrzymany.'}));const message=err.error?.message??err.message??'Dostęp do usuwania tła został wstrzymany.';await supabaseAdmin.from('ai_access_blocks').upsert({feature:'remove-background',message,status:upstream.status});return Response.json({error:{message}},{status:upstream.status});}
 const headers=new Headers({'Content-Type':upstream.headers.get('Content-Type')??'application/json','Cache-Control':'no-cache'});upstream.headers.forEach((v,k)=>{if(k.toLowerCase().startsWith('x-lovable-aig-'))headers.set(k,v)});
 return new Response(upstream.body,{status:upstream.status,headers});
}}}});
