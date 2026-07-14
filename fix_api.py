import re
import os

with open('src/services/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

helper = '''
async function safeBulkReplace<T>(table: any, serverData: any[]): Promise<T[]> {
  const syncedIds = await table.filter((r: any) => r._sincronizado === 1).primaryKeys();
  await table.bulkDelete(syncedIds);
  const localData = serverData.map((item: any) => toLocal(item, true));
  await table.bulkPut(localData);
  return localData as T[];
}
'''
if 'safeBulkReplace' not in content:
    content = content.replace('// ─── Operaciones locales', helper + '\n// ─── Operaciones locales')

pattern = r'(export async function get([A-Z]\w*)\(\): Promise<([A-Z]\w*)\[\]> {\n  if \(\!navigator\.onLine\) return localDB\.([a-zA-Z0-9_]+)\.toArray\(\);\n  try {\n    const data = await apiFetch\(([^)]+)\);\n    await localDB\.\4\.clear\(\);\n    const localData = data\.map\([^)]+\);\n    await localDB\.\4\.bulkPut\(localData\);\n    return localData as \3\[\];\n  } catch {\n    return localDB\.\4\.toArray\(\);\n  }\n})'

def repl(m):
    return f'''export async function get{m.group(2)}(): Promise<{m.group(3)}[]> {{
  if (!navigator.onLine) return localDB.{m.group(4)}.toArray();
  try {{
    const data = await apiFetch({m.group(5)});
    return await safeBulkReplace<{m.group(3)}>(localDB.{m.group(4)}, data);
  }} catch {{
    return localDB.{m.group(4)}.toArray();
  }}
}}'''

content = re.sub(pattern, repl, content)

with open('src/services/api.ts', 'w', encoding='utf-8') as f:
    f.write(content)
