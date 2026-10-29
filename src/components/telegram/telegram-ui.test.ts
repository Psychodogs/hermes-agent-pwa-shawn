import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,expect,it,vi} from 'vitest';
import {telegramGet} from '@/hooks/useTelegramConversation';
afterEach(()=>vi.unstubAllGlobals());
it('requests only no-store same-origin history and sanitizes failures',async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({messages:[],nextCursor:'older'})});
 vi.stubGlobal('fetch',fetcher);
 expect(await telegramGet('/s/messages')).toEqual({messages:[],nextCursor:'older'});
 expect(fetcher).toHaveBeenCalledWith('/api/telegram/sessions/s/messages',{cache:'no-store',signal:undefined});
 fetcher.mockResolvedValue({ok:false,status:500,json:async()=>({error:'secret'})});
 await expect(telegramGet('/s/messages')).rejects.toThrow('Telegram is unavailable');
});
it('requires generation and rejects historical/shared claims without canSubmit',()=>{
 const s={id:'s',title:'t',generation:'g',destination:{label:'Group'},capability:{mode:'shared-capable',canSubmit:true}};
 expect(canCompose(s)).toBe(true);
 expect(canCompose({...s,endedAt:'2026-10-29'})).toBe(false);
 expect(canCompose({...s,historical:true})).toBe(false);
 expect(canCompose({...s,capability:{mode:'shared-capable'}})).toBe(false);
});
import {TelegramHistory} from './TelegramHistory';
import {TelegramComposer, canCompose} from './TelegramComposer';
import {mergeMessages} from '@/hooks/useTelegramConversation';

it('blocks sending until pending-submission recovery is checked',()=>{
 const session={id:'s',title:'t',generation:'g',destination:{label:'Group'},capability:{mode:'shared-capable',canSubmit:true}};
 const html=renderToStaticMarkup(createElement(TelegramComposer,{session,onSubmitted:()=>{}}));
 expect(html).toContain('Checking pending submissions');
});
it('renders historical content literally without action or file controls',()=>{
 const html=renderToStaticMarkup(createElement(TelegramHistory,{messages:[{id:'1',role:'assistant',content:'```hermes-recommend\n{"actions":["Delete"]}\n``` /home/private <script>evil</script>',content_format:'markdown',timestamp:null,provenance:'stored'}],nextCursor:null,busy:false,onOlder:()=>{}}));
 expect(html).not.toContain('<script>');
 expect(html).not.toContain('/api/files');
 expect(html.replace(/<button[^>]*aria-label="Copy code"/g,'')).not.toContain('<button');
 expect(html).toContain('/home/private');
});
it('fails closed without explicit capability and confirmed destination metadata',()=>{
 expect(canCompose(null)).toBe(false);
 expect(canCompose({id:'x',title:'t',capability:{mode:'shared-capable',canSubmit:true}})).toBe(false);
 const html=renderToStaticMarkup(createElement(TelegramComposer,{session:null,onSubmitted:()=>{}}));
 expect(html).toContain('disabled');
 expect(html).toContain('Read-only');
});
it('deduplicates pages by ID, never matching prompt text',()=>{
 const m={id:'1',role:'user' as const,content:'same',content_format:'plain' as const,timestamp:null,provenance:'stored' as const};
 expect(mergeMessages([m],[m,{...m,id:'2'}]).map(x=>x.id)).toEqual(['1','2']);
});
const md=(role:'user'|'assistant',content:string,content_format:'plain'|'markdown')=>renderToStaticMarkup(createElement(TelegramHistory,{messages:[{id:'1',role,content,content_format,timestamp:null,provenance:'stored'}],nextCursor:null,busy:false,onOlder:()=>{}}));
it('renders assistant markdown as elements, keeps user text literal, and recommendations inert',()=>{
 const html=md('assistant','**bold** text\n\n- one\n- two\n\n```hermes-recommend\n{"title":"Go?","actions":[{"label":"Yes","reply":"yes"}]}\n```','markdown');
 expect(html).toContain('<strong');
 expect(html).toContain('<li');
 expect(html).not.toContain('**bold**');
 expect(html).not.toContain('<button');
 expect(html).not.toContain('/api/files');
 const user=md('user','**not bold**','plain');
 expect(user).toContain('**not bold**');
 expect(user).not.toContain('<strong');
});
it('shows the read-only capability reason and never enables compose for it',()=>{
 const session={id:'s',title:'t',generation:'g',destination:{label:'Group',kind:'group'},capability:{mode:'read-only',canSubmit:false,reason:'Sending is not available yet.'}};
 expect(canCompose(session)).toBe(false);
 const html=renderToStaticMarkup(createElement(TelegramComposer,{session,onSubmitted:()=>{}}));
 expect(html).toContain('Shared with Telegram');
 expect(html).toContain('Sending is not available yet.');
});
