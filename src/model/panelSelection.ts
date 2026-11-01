/** Explorer-style selection over visible tree rows; the anchor survives Shift clicks. */
export class PanelSelection {
  anchor: string | undefined;
  select(visible: string[], current: string[], id: string, modifiers: {shiftKey?:boolean;ctrlKey?:boolean;metaKey?:boolean} = {}) {
    const additive=modifiers.ctrlKey || modifiers.metaKey;
    if(modifiers.shiftKey) {
      const start=visible.indexOf(this.anchor ?? id),end=visible.indexOf(id);
      const range=start<0||end<0?[id]:visible.slice(Math.min(start,end),Math.max(start,end)+1);
      if(!this.anchor || start<0)this.anchor=id;
      return additive?[...new Set([...current,...range])]:range;
    }
    this.anchor=id;
    return additive ? current.includes(id)?current.filter(value=>value!==id):[...current,id] : [id];
  }
}
