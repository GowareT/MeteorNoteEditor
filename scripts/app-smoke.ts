import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import type { LibraryNotebook, LibraryTrashItem } from "../src/types/library";

// Development-only fixture. All library data is in memory and discarded on reload.
const notebooks: LibraryNotebook[] = [{id:'测试笔记本',name:'测试笔记本',parentPath:null,icon:'folder',colorHex:null,children:[],notes:[{id:'测试笔记本/编辑器测试',title:'编辑器测试',notebookPath:'测试笔记本',icon:'document',createdAt:'2026-01-01T08:00:00Z',modifiedAt:'2026-10-07T08:00:00Z'}]}];
const bodies = new Map([['测试笔记本/编辑器测试','# 编辑器测试\n\n正文 **加粗** 和 *斜体*。\n\n- [ ] 待办内容\n\n> [!note:#fff6d6:lightbulb] 高亮块\n\n| 名称 | 数量 |\n| --- | --- |\n| 项目 | 1 |\n\n公式 $x^2$\n']]);
let trash: LibraryTrashItem[] = [{id:'fixture-trash',kind:'note',originalPath:'测试笔记本/恢复测试',title:'恢复测试',createdAt:'2026-01-01T08:00:00Z',trashedAt:'2026-10-07T08:00:00Z'}];
mockWindows('main');
mockIPC((command,payload) => {
  const args=payload as Record<string,string>;
  switch(command) {
    case 'list_notebooks': return structuredClone(notebooks);
    case 'library_stats': return {noteCount:notebooks[0].notes.length,notebookCount:1,trashCount:trash.length};
    case 'library_root_path': return '/test-fixture/MeteorNoteEditor/Notebooks';
    case 'read_note': return bodies.get(args.path) ?? '# 恢复测试\n\n恢复的正文\n';
    case 'write_note': bodies.set(args.path,args.content);return;
    case 'search_notes': return [...bodies].filter(([path,body])=>`${path} ${body}`.includes(args.query)).map(([path,body])=>({path,title:path.split('/').pop(),excerpt:body.slice(0,150),line:1}));
    case 'list_note_versions': return [];
    case 'list_trash': return structuredClone(trash);
    case 'restore_trash_item': {
      const item=trash.find(item=>item.id===args.id)!;
      notebooks[0].notes.push({id:item.originalPath,title:item.title,notebookPath:notebooks[0].id,icon:'document'});
      trash=trash.filter(item=>item.id!==args.id);return;
    }
    case 'set_menu_bar_icon_enabled': return;
    case 'plugin:window|is_fullscreen': return false;
    case 'plugin:window|is_maximized': return false;
    default: throw new Error(`Unexpected fixture command: ${command}`);
  }
},{shouldMockEvents:true});
await import('../src/main');
