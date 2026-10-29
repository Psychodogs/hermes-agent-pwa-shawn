import {readFileSync} from 'node:fs';
import {expect,it} from 'vitest';
it('exposes Telegram in the shared desktop/mobile sidebar and ordinary context ring',()=>{
 expect(readFileSync('src/components/nav/ProjectSidebar.tsx','utf8')).toContain('href="/telegram"');
 expect(readFileSync('src/components/chat/Composer.tsx','utf8')).toContain('<ContextUsageRing');
});
it('keeps Telegram pages outside project-selection and run-manager code',()=>{
 for(const p of ['src/app/telegram/layout.tsx','src/app/telegram/page.tsx','src/app/telegram/s/[sessionId]/page.tsx']) {
  const source=readFileSync(p,'utf8');
  expect(source).not.toContain('run-manager');
  expect(source).not.toContain('activeProject=');
  expect(source).not.toContain('activeSessionId=');
 }
});
