RSYNC_DEST = rkern@www.mechanicalkern.com:webapps/github_events/

serve:
	python -m SimpleHTTPServer 8000

open:
	python -m webbrowser 'http://localhost:8000/index.html'

upload:
	rsync -avz --delete-after --exclude-from=rsync-excludes.txt ./ ${RSYNC_DEST}
