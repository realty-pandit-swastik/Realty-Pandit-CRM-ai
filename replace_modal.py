import re

with open('old.tsx', 'r') as f:
    old_content = f.read()

with open('agents/frontend/src/components/ExternalLeads.tsx', 'r') as f:
    new_content = f.read()

start_modal = "{showCreateModal && ("
end_modal = "{showLeadReassign && ("

old_modal_start = old_content.find(start_modal)
old_modal_end = old_content.find(end_modal, old_modal_start)
if old_modal_end == -1:
    end_modal = "{showConvert && selectedPhone && ("
    old_modal_end = old_content.find(end_modal, old_modal_start)

old_modal = old_content[old_modal_start:old_modal_end]

end_modal = "{showLeadReassign && ("
new_modal_start = new_content.find(start_modal)
new_modal_end = new_content.find(end_modal, new_modal_start)
if new_modal_end == -1:
    end_modal = "{showConvert && selectedPhone && ("
    new_modal_end = new_content.find(end_modal, new_modal_start)

if new_modal_start != -1 and old_modal_start != -1 and new_modal_end != -1 and old_modal_end != -1:
    replaced = new_content[:new_modal_start] + old_modal + new_content[new_modal_end:]
    with open('agents/frontend/src/components/ExternalLeads.tsx', 'w') as f:
        f.write(replaced)
    print("Replaced modal successfully!")
else:
    print(f"Could not find modal bounds! new_start={new_modal_start} new_end={new_modal_end} old_start={old_modal_start} old_end={old_modal_end}")
