import sys

p = sys.argv[1]
s = open(p, encoding='utf-8').read()
if '/analytics/script.js' in s:
    print('already present')
    sys.exit(0)

anchor = "    listen 443 ssl; # managed by Certbot"
assert s.count(anchor) == 1, 'anchor not found'

block = """	# Umami analytics (self-hosted, cookieless; service on 127.0.0.1:3000).
	# The tracker script and the collect endpoint are public. The dashboard
	# stays private (SSH tunnel to 127.0.0.1:3000) until its default admin
	# password has been changed; then the last block can proxy it too.
	location = /analytics/script.js {
		proxy_pass	http://127.0.0.1:3000;
		proxy_set_header	Host $host;
		proxy_set_header	X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header	X-Forwarded-Proto $scheme;
	}

	location = /analytics/api/send {
		proxy_pass	http://127.0.0.1:3000;
		proxy_set_header	Host $host;
		proxy_set_header	X-Real-IP $remote_addr;
		proxy_set_header	X-Forwarded-For $proxy_add_x_forwarded_for;
		proxy_set_header	X-Forwarded-Proto $scheme;
	}

	location /analytics {
		return 404;
	}

"""
s = s.replace(anchor, block + anchor, 1)
open(p, 'w', encoding='utf-8').write(s)
print('added')
