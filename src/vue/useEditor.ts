import { customRef } from "vue";
import { editor } from "../editor/instance";
import { useEditorSelector } from "./useEditorSelector";
/** Track the UI revision directly without proxying the editor or its documents. */
export function useEditor(source = editor) {
  const revision = useEditorSelector(source, source.uiSnapshot);
  return customRef<typeof editor>(() => ({
    get() {
      revision.value;
      return source;
    },
    set() {
      throw Error("The editor instance cannot be replaced");
    },
  }));
}
