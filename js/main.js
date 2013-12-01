var ghevents = (function () {
    //// Private interface ////////////////////////////////////////////////

    // The login information to be filled in by the login form.
    var login_info = {
        // username: null,
        // organization: null,
        // access_token: null
        username: "pberkes",
        organization: "enthought",
        access_token: "fd3a0e0f44cef1bfce068d5695c73484dfccc2d2"
    };

    // The event refresh period in milliseconds.
    var refresh_period = 5 * 60 * 1000;

    // The maximum number of events to show.
    var max_events = 50;

    // Split a string by a delimiter and index with Python semantics.
    var rsplitIndex = function(string, delimiter, index) {
        var bits = string.split(delimiter);
        if (index < 0) {
            index += bits.length;
        }
        return bits[index];
    };

    var firstLine = function(line) {
        if (line) {
            return rsplitIndex(line, '\n', 0);
        } else {
            return '';
        }
    };

    // Uniquify an Array.
    var uniquify = function(input) {
        var output = [];
        var i;
        input.forEach(function (obj) {
            for (i=0; i<output.length; i++) {
                if (output[i] == obj) {
                    return;
                }
            };
            output.push(obj);
        });
        return output;
    };

    String.prototype.capitalize = function (all) {
        if (all) {
           return this.split(' ').map(function (e) {return e.capitalize();}).join(' ');    
        } else {
             return this.charAt(0).toUpperCase() + this.slice(1);
        } 
    };

    String.prototype.startswith = function (needle) {
        return this.substr(0, needle.length) == needle;
    };

    String.prototype.endswith = function (needle) {
        return this.substr(this.length - needle.length, this.length) == needle;
    };

    // Strip > reply lines from email-formatted comments.
    var stripEmailReplyLines = function (text) {
        var lines = text.split('\n');
        var good_lines = [];
        var i;
        for (i=0; i<lines.length; i++) {
            var line = $.trim(lines[i]);
            if (line == '--') {
                // Signature follows.
                break;
            } else if (line[0] == '>') {
                // Reply line.
                continue;
            } else if (line.startswith('On ') && line.endswith(':')) {
                // Heuristic beginning of reply.
                continue;
            } else {
                good_lines.push(line);
            }
        }
        return $.trim(good_lines.join('\n'));
    };

    // The map of event types to extractors of template namespaces.
    var event_namespaces = {
        CreateEvent: function(ns) {
            ns.ref_type = ns.payload.ref_type.capitalize();
            if (ns.payload.ref == null) {
                ns.ref = "";
            } else {
                ns.ref = '“' + ns.payload.ref + '”';
            }
            if (ns.payload.ref_type == "repository") {
                ns.description = '“' + ns.payload.description + '”';
            } else {
                ns.description = "";
            }
            return ns;
        },
        DeleteEvent: function(ns) {
            ns.ref_type = ns.payload.ref_type.capitalize();
            return ns;
        },
        IssuesEvent: function(ns) {return ns;},
        PullRequestEvent: function(ns) {
            if (ns.payload.pull_request.commits == 1) {
                ns.plural = "";
            } else {
                ns.plural = "s";
            }
            return ns;
        },
        CommitCommentEvent: function(ns) {
            ns.payload.body = stripEmailReplyLines(ns.payload.body);
            return ns;
        },
        IssueCommentEvent: function(ns) {
            ns.payload.comment.body = stripEmailReplyLines(ns.payload.comment.body);
            return ns;
        },
        PullRequestReviewCommentEvent: function(ns) {
            var pr_api_url = ns.payload.comment._links.pull_request.href;
            ns.pull_request_number = rsplitIndex(pr_api_url, '/', -1);
            $.ajax({
                dataType: "json",
                url: pr_api_url,
                async: false
            }).done(function (json) {
                ns.pull_request = json;
            });
            ns.payload.comment.body = stripEmailReplyLines(ns.payload.comment.body);
            return ns;
        },
        PushEvent: function(ns) {
            var participants = [];

            ns.payload.commits.forEach(function (c) {
                participants.push(c.author.name);
            });
            participants = uniquify(participants);
            participants.sort();
            ns.participants = participants.join(', ');
            ns.n_participants = participants.length;
            if (ns.n_participants == 1) {
                ns.participants_plural = "";
            } else {
                ns.participants_plural = "s";
            }
            if (ns.payload.size == 1) {
                ns.commits_plural = "";
            } else {
                ns.commits_plural = "s";
            }

            ns.branch = rsplitIndex(ns.payload.ref, '/', -1);
            ns.render_commit = function () {
                return this.author.name + ": “" + firstLine(this.message) + "”";
            };

            return ns;
        }
    };

    var organizationFeedURL = function () {
        return ('https://api.github.com/users/'
                + login_info.username
                + '/events/orgs/'
                + login_info.organization
                + '?access_token='
                + login_info.access_token);
    };

    var showEvents = function () {
        $.getJSON(organizationFeedURL(), function (data) {
            var namespaces = [];
            $.each(data, function (index, val) {
                var ns;
                var type;
                if (namespaces.length < max_events) {
                    if (val.type in event_namespaces) {
                        ns = event_namespaces[val.type](val);
                        type = val.type;
                        ns.timestamp = strftime("%d %b, %H:%M", new Date(ns.created_at));
                        ns.repo_name = ns.repo.name.replace('/', '/<wbr>');
                        ns.event_title = $.Mustache.render(type + '-title', ns);
                        ns.event_description = $.Mustache.render(type + '-description', ns);
                        namespaces.push(ns);
                    }
                }
            });
            if ($('#ghevents-events').children()) {
                $('#ghevents-events').fadeOut().empty();
            }
            $.each(namespaces, function (index, ns) {
                $('#ghevents-events').mustache('whole-event', ns);
            });
            $('.event-body').dotdotdot({
                height: 130,
                ellipsis: "…",
                watch: true
            });
            $('#ghevents-events').fadeIn();
        });
    };

    var getLocalLoginInfo = function () {
        login_info.username = localStorage.getItem("username");
        login_info.organization = localStorage.getItem("organization");
        login_info.access_token = localStorage.getItem("access_token");
    };

    var storeLocalLoginInfo = function () {
        localStorage.setItem("username", login_info.username);
        localStorage.setItem("organization", login_info.organization);
        localStorage.setItem("access_token", login_info.access_token);
    }

    //// Public interface /////////////////////////////////////////////////
    var initModule = function ($container) {
        getLocalLoginInfo();
        $.Mustache.load('templates/event-templates.html').done(function() {
            if (login_info.username == null) {
                $('#login-form').fadeIn();
                $('#login_button').click(function (event) {
                    // Grab the login information.
                    login_info.username = $('#username').val();
                    login_info.organization = $('#organization').val();
                    login_info.access_token = $('#access_token').val();
                    storeLocalLoginInfo();
                    // Hide the form and start getting events.
                    $('#login-form').fadeOut();
                    showEvents();
                    window.setInterval(showEvents, refresh_period);
                    event.preventDefault();
                });
            } else {
                // Logged in. Start getting events now.
                showEvents();
                window.setInterval(showEvents, refresh_period);
            }
        });
    };

    return {
        initModule: initModule
    };
}());

$(function () {ghevents.initModule($('#ghevents'));});
