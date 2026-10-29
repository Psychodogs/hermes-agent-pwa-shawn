import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import {ContextUsageRing} from '@/components/chat/ContextUsageRing';
it('renders a keyboard/touch accessible unknown ring without a fake percentage',()=>{
 const html=renderToStaticMarkup(createElement(ContextUsageRing,{}));
 expect(html).toContain('<summary');
 expect(html).toContain('Context usage unknown');
 expect(html).not.toContain('0%');
 expect(html).toContain('shrink-0');
});
