import { customRef } from "vue";
import { editor } from "../editor/instance";
import { useEditorSelector } from "./useEditorSelector";
/** Track the UI revision directly without proxying the editor or its documents. */
export function useEditor() {
  const revision = useEditorSelector(editor, editor.uiSnapshot);
  return customRef<typeof editor>(() => ({
    get() {
      revision.value;
      return editor;
    },
    set() {
      throw Error("The editor instance cannot be replaced");
    },
  }));
}
