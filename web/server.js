/* Handle refresh of page */
function get_french_timestamp(date){
  var timestamp;
  if(!isNaN(Number(date))) {
    var now = new Date();
    if(Number(date) > 9622103330) {
      date = Math.floor(Number(date)/1000);
    }
    timestamp = Number(date) + (180 + now.getTimezoneOffset()) * 60;
  } else if(date instanceof Date) {
    ms = date.getTime() + (180 + date.getTimezoneOffset()) * 60000;
    timestamp = Math.floor(ms/1000);
  } else {
    console.log('Error timestamp:'+date);
    timestamp = date;
  }
  return timestamp;
}
function time_elapsed_since(date) {
    var timestamp = get_french_timestamp(date)
    var now = new Date();
    var since = get_french_timestamp(now) - timestamp;
    if(since < 60) {
      return "à l'instant";
    }
    var chunks = [
        [60 * 60 * 24 * 365 , 'an'],
        [60 * 60 * 24 * 30 , 'mois'],
        [60 * 60 * 24 * 7, 'semaine'],
        [60 * 60 * 24 , 'jour'],
        [60 * 60 , 'heure'],
        [60 , 'minute'],
        [1 , 'seconde']
    ];

    for(var i = 0; i < chunks.length; i++) {
        var seconds = chunks[i][0];
        var name = chunks[i][1];
        var count = Math.floor(since / seconds)
        if(count != 0) {
            break;
        }
    }

    var print = (count <= 1 || name == 'mois') ? count+' '+name : count+' '+name+'s';
    return 'il y a '+print;
}

var articles = {};
class Notifier {
  constructor() {
    this.sum = 0;
    this.notifs = {};
    var $this = this
    setInterval(function(){
      $this.publish_notifications();
    }, 500);
  }
  add_notification(articleId) {
    if(this.notifs[articleId]){
      this.notifs[articleId]++;
    } else {
      this.notifs[articleId] = 1;
    }
  }
  clear_notifications(articleId) {
    this.notifs[articleId] = 0;
  }
  publish_notifications() {
    var sum = 0
    for(var id in this.notifs) {
      var notif = $('#notif-'+id);
      if(notif.length > 0){
        var nb_notifs = this.notifs[id];
        if(notif.html() != (nb_notifs+'')){
          notif.html(nb_notifs);
          if(nb_notifs > 0){
            notif.removeClass('hide')
          } else {
            notif.addClass('hide')
          }
        }
      }
      sum += this.notifs[id];
    }
    if(this.sum != sum){
      var title = $('title').first();
      if(sum > 0){
        title.html('('+sum+') Carnets de déroute');
      } else {
        title.html('Carnets de déroute');
      }
    }
    this.sum = sum;
  }
}
class Server {
  constructor(bound = -1) {
    this.bound = bound;
    this.push = [];
    this.pull = [];
    this.last_sync = 0;
    var $this = this;
    setInterval(function(){
      if((new Date().getTime() - $this.last_sync) > 1000){
          $this.synchronize();
      }
    }, 5*1000);
  }
  process_new_comments(comments){
    for(var i = 0; i < comments.length; i++){
      var comment = comments[i];
      var article = articles[comment.articleId];
      if(article) {
        article.add_comment(comment);
      } else {
        console.log('Article not found: '+comment.articleId);
      }
    }
  }
  return_pull(responses){
    for (var id in responses) {
      // skip loop if the property is from prototype
      if (!responses.hasOwnProperty(id)) continue;
      var comments = responses[id];
      var article = articles[id];
      if(article) {
        var l = comments.length;
        for(var i = 0; i < l; i++){
          var comment = comments[(l-1) - i];
          article.add_comment(comment, false, true);
        }
        $('#article'+id).find('a.see_more .fa-spin').remove();
      } else {
        console.log('Article not found: '+id);
      }
    }
  }
  synchronize(){
    this.last_sync = new Date().getTime();
    var data = {
      bound: this.bound,
      push: this.push,
      pull: this.pull
    }
    this.pull = [];
    this.push = [];
    var $this = this;
    if($this.push.length > 0){
      console.log('TO PUSH ')
      console.log(data.push)
    }
    $.ajax({
      url: SERVER_URL,
      type: "POST",
      dataType: "json",
      data: data,
      async: true,
      success: function (response)
      {
        $this.bound = response.bound;
        $this.process_new_comments(response.comments);
        $this.return_pull(response.responses);
      },
      error: function (response) {
        console.log('Call to server failed, dropped calls:');
        console.log(data.push);
      }
    });
  }
  add_push(data){
    this.push.push(data);
    this.synchronize();
  }
  add_request(request){
    this.pull.push(request);
  }
}
var server = new Server(BOUND);
var notifier = new Notifier();
class Article {
  constructor(id, type) {
    this.id = id
    this.type = type;
    this.pending = [];
    var $this = this;
    var article = $('#article'+this.id);
    if(article) {
      var form = article.find('form');
      form.submit(function(e){
        e.preventDefault();
        $this.send_comment();
      });
      form.find('textarea').focus(function(){
        notifier.clear_notifications($this.id);
      });
      var see_more_link = article.find('.see_more').first();
      if(see_more_link){
        $this.offset = 10;
        see_more_link.on('click', function(e){
          e.preventDefault();
          see_more_link.prepend('<i class="fa fa-spin fa-circle-o-notch"></i> ');
          server.add_request({
            articleId: $this.id,
            offset: $this.offset,
            limit: 10
          });
          $this.offset += 10;
        })
      } else {
        $this.offset = article.find('.comments p.card-text').length;
      }
    }
    setInterval(function(){
      $this.update_dates();
    }, 10*1000);
  }
  build(data){
    // set dom and listener
  }
  update_dates() {
    $('#article'+this.id).find('.date').each(function(){
      var date = $(this).attr('data-date');
      if(date){
        $(this).html(time_elapsed_since(date));
      }
    });
  }
  send_comment() {
    var form = $('#article'+this.id).find('form');
    var date = new Date();
    var time_since = time_elapsed_since(date.getTime());
    var comment = {
      author: USERNAME,
      date: get_french_timestamp(date),
      time_since: time_since,
      content: form.find('#form_text').val()
    }
    this.add_comment(comment, true);
    this.pending.push(comment.date);
    server.add_push([this.id, comment]);
    form.find('#form_text').val('').css('height', '45px').focus();
  }
  add_comment(comment, pending=false, prepend=false) {
    if(this.pending.includes(comment.date)){
      var idx = this.pending.indexOf(comment.date);
      this.pending.splice(idx, 1);
      $('#pending'+comment.date).remove();
    } else {
      var article = $('#article'+this.id);
      var comment_date;
      if(!prepend){
        var date = new Date();
        comment_date = Math.floor(date.getTime()/1000);
      } else {
        comment_date = comment.date;
      }
      var closest_author;
      if(this.type == 'message'){
        if(!prepend){
          closest_author = article.find('.author').last().html();
        } else {
          closest_author = -1;// TODO
        }
      }
      var merge_comments = (comment.author == closest_author);
      var elem = article.find('.comments').first();
      var node = '';
      if(!merge_comments){
      node += `<div class="hr"></div>
      <div class="rpz_box_icon">
        <h6>
            `+ (pending ? '<span id="pending'+comment.date+'"><i class="fa fa-spin fa-circle-o-notch"></i> </span>' : '')
           +`<span class="author">`+comment.author+`</span>,
            <span class="date" data-date="`+comment_date+`">`+comment.time_since+`</span>
        </h6>
      </div>`
      }
      var escaped_text = $("<div>").text(comment.content).html();
      node +=
      `<p class="card-text new-p" style="font-size: 0.95em;">
        `+ ((pending && merge_comments)? '<span id="pending'+comment.date+'"><i class="fa fa-spin fa-circle-o-notch"></i> </span>' : '')
        +escaped_text+`
      </p>`;
      if(prepend){
        elem.prepend($(node));
      } else {
        elem.append($(node));
        if(!pending){
          notifier.add_notification(this.id);
        }
      }
    }
  }
}
