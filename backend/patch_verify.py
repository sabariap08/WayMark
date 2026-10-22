import re
p = r"D:\Non Academics\WayMark\Prototype\backend\blueprints\certificates.py"
s = open(p, encoding='utf-8').read()
if "rate_limit" not in s:
    s = s.replace("from utils.mailer import send_mail\n", "from utils.mailer import send_mail\nfrom utils.rate_limit import rate_limit\n")
s = re.sub(r"(@certificates_bp\.route\('/verify/<credential_id>', methods=\['GET'\]\)\n)(?!@rate_limit)", r"\1@rate_limit(limit=30, window_seconds=60)\n", s)
open(p, 'w', encoding='utf-8').write(s)
print("done")
