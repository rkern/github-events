Github Events Dashboard
-----------------------

Single-page Javascript app for displaying the Github events for an organization.
It follows the Python `github_newsfeed` app closely.

For a local deployment, use `make serve &` to start a `SimpleHTTPServer` process
on port 8000 and background it. Use `make open` to open a web browser to view
the app.

On your first view, you will be presented with a login screen. You will need
your Github username and an
[https://help.github.com/articles/creating-an-access-token-for-command-line-use](access
token). This information will be stored in HTML5 `localStorage`. TODO: Make an
option to clear this information.
