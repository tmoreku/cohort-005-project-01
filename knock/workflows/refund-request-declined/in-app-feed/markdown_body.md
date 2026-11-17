Your refund request for {{ data.courseTitle }} was declined{% if data.note != blank %}

{{ data.adminName }}: "{{ data.note | newline_to_br | replace: "<br />", " " | strip_newlines | truncate: 140, "…" }}"{% endif %}