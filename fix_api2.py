import re
import os

with open('src/services/api.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace all implementations of get functions that use clear()
def replacer(match):
    table_name = match.group(1)
    return f"return await safeBulkReplace(localDB.{table_name}, data);"

# The regex looks for:
# await localDB.tablename.clear();
# const localData = data.map(...);
# await localDB.tablename.bulkPut(localData);
# return localData as Type[];
pattern = r"await localDB\.([a-zA-Z0-9_]+)\.clear\(\);\s+const localData = data\.map\([^;]+;\s+await localDB\.\1\.bulkPut\(localData\);\s+return localData as [a-zA-Z0-9_]+\[\];"

new_content = re.sub(pattern, replacer, content)

with open('src/services/api.ts', 'w', encoding='utf-8') as f:
    f.write(new_content)
