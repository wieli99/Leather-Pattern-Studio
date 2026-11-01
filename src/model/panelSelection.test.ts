import {expect,it} from 'vitest';
import {PanelSelection} from './panelSelection';
it('supports anchored ranges, toggles and additive ranges',()=>{
 const s=new PanelSelection(),rows=['a','b','c','d'];
 expect(s.select(rows,[],'b')).toEqual(['b']);
 expect(s.select(rows,['b'],'d',{shiftKey:true})).toEqual(['b','c','d']);
 expect(s.select(rows,['b','c','d'],'a',{shiftKey:true})).toEqual(['a','b']);
 expect(s.select(rows,['a'],'d',{ctrlKey:true})).toEqual(['a','d']);
 expect(s.select(rows,['a','d'],'b',{ctrlKey:true,shiftKey:true})).toEqual(['a','d','b','c']);
});
