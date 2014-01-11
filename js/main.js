var ghevents = (function () {
    //// Private interface ////////////////////////////////////////////////

    // The login information to be filled in by the login form.
    var login_info = {
        username: null,
        organization: null,
        access_token: null
    };

    // Cache of true names of users.
    var userNameCache = {};

    var lookupUserName = function (loginId) {
        if (!(loginId in userNameCache)) {
            $.ajax({
                dataType: "json",
                url: 'https://api.github.com/users/' + loginId + '?access_token=' + login_info.access_token,
                async: false
            }).done(function (json) {
                if (json.name) {
                    userNameCache[loginId] = json.name;
                } else {
                    userNameCache[loginId] = loginId;
                }
            });
        }
        return userNameCache[loginId];
    };

    // The event refresh period in milliseconds.
    // var refresh_period = 5 * 1000;
    var refresh_period = 5 * 60 * 1000;

    // The maximum number of events to show.
    var max_events = 50;

    var createCookie = function (name, value, days) {
        var expires;

        if (days) {
            var date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toGMTString();
        } else {
            expires = "";
        }
        document.cookie = escape(name) + "=" + escape(value) + expires + "; path=/";
    }

    var readCookie = function (name) {
        var nameEQ = escape(name) + "=";
        var ca = document.cookie.split(';');
        for (var i = 0; i < ca.length; i++) {
            var c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return unescape(c.substring(nameEQ.length, c.length));
        }
        return null;
    }

    var eraseCookie = function (name) {
        createCookie(name, "", -1);
    }

    // Split a string by a delimiter and index with Python semantics.
    var splitIndex = function(string, delimiter, index) {
        var bits = string.split(delimiter);
        if (index < 0) {
            index += bits.length;
        }
        return bits[index];
    };

    var firstLine = function(line) {
        if (line) {
            return splitIndex(line, '\n', 0);
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
        GollumEvent: function(ns) {
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
            ns.payload.body = stripEmailReplyLines(ns.payload.comment.body);
            return ns;
        },
        IssueCommentEvent: function(ns) {
            ns.payload.comment.body = stripEmailReplyLines(ns.payload.comment.body);
            return ns;
        },
        PullRequestReviewCommentEvent: function(ns) {
            var pr_api_url = ns.payload.comment._links.pull_request.href;
            ns.pull_request_number = splitIndex(pr_api_url, '/', -1);
            $.ajax({
                dataType: "json",
                url: pr_api_url + '?access_token=' + login_info.access_token,
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

            ns.branch = splitIndex(ns.payload.ref, '/', -1);
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

    var shouldShowEvent = function (ns) {
        var should_show = true;
        should_show &= (ns.type in event_namespaces);
        should_show &= (splitIndex(ns.repo.name, '/', 0) == login_info.organization);
        return should_show;
    };

    var breakWord = function (word) {
        var parts = [];
        var i, character;
        for (i=0; i < word.length; i++) {
            character = word.charAt(i);
            if (character in ['-', '_', '/']) {
                parts.push(character);
                parts.push('<wbr>');
            } else if (character == character.toUpperCase()) {
                parts.push('<wbr>');
                parts.push(character);
            } else {
                parts.push(character);
            }
        }
        return parts.join('');
    };

    var showEvents = function () {
        $.getJSON(organizationFeedURL(), function (data) {
            var namespaces = [];
            $.each(data, function (index, val) {
                var ns;
                var type;
                if (namespaces.length < max_events) {
                    if (shouldShowEvent(val)) {
                        type = val.type;
                        ns = event_namespaces[type](val);
                        ns.timestamp = strftime("%d %b, %H:%M", new Date(ns.created_at));
                        // ns.repo_name = ns.repo.name.replace('/', '/<wbr>');
                        ns.repo_name = breakWord(splitIndex(ns.repo.name, '/', 1));
                        ns.event_title = $.Mustache.render(type + '-title', ns);
                        ns.event_description = $.Mustache.render(type + '-description', ns);
                        ns.user_name = lookupUserName(ns.actor.login);
                        namespaces.push(ns);
                    }
                }
            });
            $.each(namespaces, function (index, ns) {
                $('#ghevents-store').mustache('whole-event', ns);
            });
            if ($('#ghevents-events').children()) {
                $('#ghevents-events').fadeOut().empty();
            }
            $('.event-box').appendTo('#ghevents-events');
            $('.event-body').dotdotdot({
                height: 160,
                ellipsis: "…",
                watch: true
            });
            $('#ghevents-events,.slim-navbar').fadeIn();
        });
    };

    var getLocalLoginInfo = function () {
        login_info.username = readCookie("username");
        login_info.organization = readCookie("organization");
        login_info.access_token = readCookie("access_token");
    };

    var storeLocalLoginInfo = function () {
        createCookie("username", login_info.username);
        createCookie("organization", login_info.organization);
        createCookie("access_token", login_info.access_token);
    }

    var clearLocalLoginInfo = function () {
        login_info.username = null;
        login_info.organization = null;
        login_info.access_token = null;
        eraseCookie("username");
        eraseCookie("organization");
        eraseCookie("access_token");
    }

    //// Public interface /////////////////////////////////////////////////
    var initModule = function ($container) {
        getLocalLoginInfo();
        $.Mustache.load('templates/event-templates.html').done(function() {
            $('.reload-link').click(function (event) {
                showEvents();
                event.preventDefault();
            });
            $('.logout-link').click(function (event) {
                clearLocalLoginInfo();
                $('#ghevents-events').fadeOut();
                $('.slim-navbar').fadeOut();
                $('#login-form').fadeIn();
                event.preventDefault();
            });
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
            if (login_info.username == null) {
                $('#login-form').fadeIn();
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
