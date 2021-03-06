const Discord = require("discord.js");
const client = new Discord.Client();
const ytdl = require("ytdl-core");
const request = require("request");
const fs = require("fs");
const getYoutubeID = require("get-youtube-id");
const fetchVideoInfo = require("youtube-info");
const Timer = require('easytimer.js')

const youtube = require("./youtube.js");

var config = require('./config.json');

const yt_api_key = config.yt_api_key;
const bot_controller = config.bot_controller;
const prefix = config.prefix;
const discord_token = config.discord_token;
const channel_id = config.channel_id;

const streamOptions = { volume: 0.05};

var queue = [];
var queueNames = [];
var isPlaying = false;
var dispatcher = null;
var voiceChannel = null;
var skipReq = 0;
var skippers = [];
var connected = 0;
var members = [];
var timer = null;

console.log("Connexion à l'API youtube")
youtube.setApiKey(yt_api_key);

client.login(discord_token);

client.on('message', function (message) {
  const member = message.member;
  const mess = message.content.toLowerCase();
  const args = message.content.split(' ').slice(1).join(" ");

  if(message.channel.id === channel_id){ // si le message est envoyé sur le bon channel
    if (mess.startsWith(prefix + 'play')) { // si la commande est play
      if (member.voiceChannel || voiceChannel != null) { // si le bot est déjà dans un channel vocal
        if (queue.length > 0 || isPlaying) { // si une musique est déjà présente dans la liste
          if (args.toLowerCase().indexOf("list=") === -1) { // si la video n'est pas une playlist
          youtube.getID(args, function(id) {
            if (id != -1){
              add_to_queue(id);
              fetchVideoInfo(id, function(err, videoInfo) {
                if (err) throw new Error(err);
                var date = new Date(null);
                date.setSeconds(videoInfo.duration); // specify value for SECONDS here
                var result = date.toISOString().substr(11, 8);

                message.reply(" **" + videoInfo.title + "** (" + result + ") ajouté à la liste.");
                queueNames.push(videoInfo.title);
              });
            } else {
              message.reply(" la requête n'a rien donné.");
            }
          });
        } else {
          youtube.getPlayListSongs(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(arr) { // si la vidéo est une playlist
            if (arr != -1){
              arr.forEach(function(e) {
                add_to_queue(e.snippet.resourceId.videoId);
                queueNames.push(e.snippet.title);
              });
              youtube.getPlayListMetaData(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(data) {

                message.reply(" playlist **" + data.snippet.title + "** ajouté à la liste.");
              });
            } else {
              message.reply(" la requête n'a rien donné.");
            }
          });
        }
      } else { // si aucune musique est présente dans la liste
        isPlaying = true;
        if (args.toLowerCase().indexOf("list=") === -1) { // si la video n'est pas une playlist
        youtube.getID(args, function(id) {
          if (id != -1){
            queue.push(id);
            fetchVideoInfo(id, function(err, videoInfo) {
              if (err) throw new Error(err);
              queueNames.push(videoInfo.title);
              var date = new Date(null);
              date.setSeconds(videoInfo.duration); // specify value for SECONDS here
              var result = date.toISOString().substr(11, 8);

              message.reply(" lecture de **" + videoInfo.title + "** (" + result + ").");
              playMusic(id, message);
            });

          } else {
            message.reply(" la requête n'a rien donné");
          }
        });
      } else { // si la video est une playlist
        youtube.getPlayListSongs(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(arr) {
          if (arr != -1){
            arr.forEach(function(e) {
              add_to_queue(e.snippet.resourceId.videoId);
              queueNames.push(e.snippet.title);
            });

            youtube.getPlayListMetaData(args.match(/list=(.*)/)[args.match(/list=(.*)/).length - 1], 50, function(data) {
              message.reply(" playlist **" + data.snippet.title + "** ajouté à la liste, lecture de **" + queueNames[0] + "**.");
            });

            playMusic(queue[0], message);

          } else {
            message.reply(" la requête n'a rien donné.");
          }
        });
      }
    }
  } else { // si ni l'utilisateur, ni le bot n'est présent dans un channel
  message.reply(' vous, ou le bot, devez être présent dans un channel vocal !');
}
} else if (mess.startsWith(prefix + 'skip')) { // si la commande est skip
  if(queueNames[0] != null){ // si aucune musique n'est en train de jouer
  if (skippers.indexOf(message.author.id) == -1) { // si l'utilisateur n'as pas déjà voté
  skippers.push(message.author.id);
  skipReq++;
  if (skipReq >= Math.ceil((voiceChannel.members.size - 1) / 2)) { // si le nombre d'utilisateur ayant voté est suffisant
  try {
    if(connected) message.reply(" votre vote a bien été pris en compte. Passage à la musique suivante !");
    skip_song();
  } catch (err) {
    console.log(err);
  }
} else {
  message.reply(" votre vote a bien été pris en compte. Encore **" + ((Math.ceil((voiceChannel.members.size - 1) / 2)) - skipReq) + "** votes pour passer à la musique suivante.");
}
} else {
  message.reply(" vous avez déjà voté !");
}
} else {
  message.reply(" la playlist est vide.");
}
} else if (mess.startsWith(prefix + 'fskip') && member.roles.has(bot_controller)) {
  if(queueNames[0] != null){
    try {
      if(Number.isInteger(parseInt(args)) && parseInt(args) != 1){
        if(args > 1 && args < queueNames.length){
          if(connected) message.reply(" suppression de la musique " + parseInt(args) + " : " + queueNames[parseInt(args)-1]);
          queueNames.splice(parseInt(args)-1,1);
          queue.splice(parseInt(args)-1,1);
        } else {
          message.reply(" cette musique n'est pas présente dans la playlist.");
        }
      } else {
        if(connected) message.reply(" passage à la musique suivante !");
        skip_song();
      }
    } catch (err) {
      console.log(err);
    }
  } else {
    message.reply(" la playlist est vide.");
  }
} else if (mess.startsWith(prefix + "queue")) {
  var emb = "\n";
  if(queueNames[0] != null){
    emb = [];
    emb[0] = ("\n__**1:**__  `" + queueNames[0] + " **(Musique actuelle)**`\n");
    i = 1;
    var embtmp = emb[0];
    var embNum = parseInt(i/10,10);
    while(i != queueNames.length ){
      if(Number.isInteger(i/10)){
        emb[parseInt(i/10,10)] = "\n";
        embNum = parseInt(i/10,10);
        embtmp = "";
      }
      emb[embNum] = embtmp.concat("__**" + (i + 1) + ":**__  `" + queueNames[i] + "`\n");

      embtmp = emb[embNum];

      i++;
    }

    for(i = 0; i < emb.length; i++){
      message.channel.send(emb[i])
    }


  } else message.reply("Aucune musique dans la playlist");

} else if (mess.startsWith(prefix + "song")) {
  if(isPlaying && queueNames[0] != null)  message.reply(" la musique actuelle est : __**" + queueNames[0] + "**__");
  else  message.reply(" aucune musique en cours.");
} else if (mess.startsWith(prefix + "kill") && member.roles.has(bot_controller)) {
  if(voiceChannel != null){
    voiceChannel.leave();
    connected = 0;
    if(dispatcher != null)
    dispatcher.destroy();
    queue = [];
    queueNames = [];
    isPlaying = false;
    dispatcher = null;
    voiceChannel = null;
    skipReq = 0;
    skippers = [];
    client.user.setActivity("Entrez " + prefix + "help pour l'aide.");
    message.channel.send("Bye !");
    if(timer != null){
      timer.stop();
      timer = null;
    }

  }
} else if (mess.startsWith(prefix + 'pause') && member.roles.has(bot_controller) && isPlaying) {
  try {
    dispatcher.pause();
    message.reply("Mise en pause !");
    isPlaying = false;
  } catch (error) {
    message.reply("Aucune musique en cours.");
  }
} else if (mess.startsWith(prefix + 'resume') && member.roles.has(bot_controller) && !isPlaying) {
  try {
    dispatcher.resume();
    message.reply("Lecture !");
    isPlaying = true;
  } catch (error) {
    message.reply("Aucune musique en cours.");
  }
} else if (mess.startsWith(prefix + 'help')) {
  message.reply({embed: {
    color: 0xff0000,
    author: {
      name: client.user.username,
      icon_url: client.user.avatarURL
    },
    title: "Commandes pour le bot musique.",

    description: "Voici les commandes pour le bot :",
    fields: [{
      name: prefix + "play (URL/Nom de vidéo/Playlist)",
      value: "Lance une musique et rejoins le channel vocal."
    },
    {
      name: prefix + "pause",
      value: "Mets en pause la musique actuelle (nécessite le role Dj)."
    },
    {
      name: prefix + "resume",
      value: "Remets en route la musique actuelle (nécessite le role Dj)."
    },
    {
      name: prefix + "queue",
      value: "Affiche la liste des musiques."
    },
    {
      name: prefix + "song",
      value: "Affiche la musique actuelle."
    },
    {
      name: prefix + "skip",
      value: "Lance un vote pour passer à la musique suivante."
    },

    {
      name: prefix + "fskip",
      value: "Force le passage à la musique suivante (nécessite le role Dj)."
    },

    {
      name: prefix + "fskip + N°",
      value: "Retire la musique demandée de la playlist (nécessite le role Dj)."
    },

    {
      name: prefix + "shuffle",
      value: "Mélange les musiques dans la playlist (nécessite le role Dj)."
    },

    {
      name: prefix + "clear",
      value: "Vide la playlist (nécessite le role Dj)."
    },

    {
      name: prefix + "help",
      value: "Affiche cette liste."
    },

    {
      name: prefix + "kill",
      value: "Déconnecte le bot du channel vocal."
    },
  ],
  timestamp: new Date(),
  footer: {
    icon_url: client.user.avatarURL,
    text: "botMusicCalvin :3"
  }
}
});
} else if (mess.startsWith(prefix + "shuffle") && member.roles.has(bot_controller)) {
  if(queueNames.length > 2){
    queuetmp = []
    queueNamestmp = [];
    queuetmp[0] = queue.shift();
    queueNamestmp[0] = queueNames.shift();

    shuffle(queue,queueNames)

    for(i = 1; i < queue.length + 1; i++){
      queuetmp[i] = queue[i-1];
      queueNamestmp[i] = queueNames[i-1];
    }

    queue = queuetmp;
    queueNames = queueNamestmp;

    message.reply(" :ok_hand:");
  } else message.reply(" vous devez avoir au moins trois musiques dans la playlist.");

} else if (mess.startsWith(prefix + "clear") && member.roles.has(bot_controller)){
  if(queueNames.length > 1){
    queuetmp = queue[0];
    queueNamestmp = queueNames[0];
    queue = [];
    queueNames = [];
    queue[0] = queuetmp;
    queueNames[0] = queueNamestmp;
    message.reply(" :ok_hand:");
  } else message.reply(" vous devez avoir au moins deux musiques dans la playlist.");
}

}});

client.on('voiceStateUpdate', (oldMember, newMember) => {
  if(voiceChannel != null){
    let newUserChannel = newMember.voiceChannel
    let oldUserChannel = oldMember.voiceChannel

    if(oldUserChannel === undefined && newUserChannel !== undefined) {
      // User Joins a voice channel
      members = voiceChannel.members;
      if(timer != null){
        timer.stop()
        timer = null;
      }

    } else if(newUserChannel === undefined){
      // User leaves a voice channel
      members = voiceChannel.members;
      if(members.size == 1){
        timer = new Timer();
        timer.start({countdown: true, startValues: {seconds: 5}});
        timer.addEventListener('targetAchieved', function (e) {
          if(voiceChannel != null){
            voiceChannel.leave();
            connected = 0;
            if(dispatcher != null)
            dispatcher.destroy();
            queue = [];
            queueNames = [];
            isPlaying = false;
            dispatcher = null;
            voiceChannel = null;
            skipReq = 0;
            skippers = [];
            client.user.setActivity("Entrez " + prefix + "help pour l'aide.");
          }
        });
      }
    } if(oldUserChannel && newUserChannel && oldUserChannel.id != newUserChannel.id) {
      if(newMember.id == client.user.id && newUserChannel != voiceChannel){
        voiceChannel = newUserChannel;
      }
      members = voiceChannel.members;

      if(members.size == 1){
        timer = new Timer();
        timer.start({countdown: true, startValues: {seconds: 5}});
        timer.addEventListener('targetAchieved', function (e) {
          if(voiceChannel != null){
            voiceChannel.leave();
            connected = 0;
            if(dispatcher != null)
            dispatcher.destroy();
            queue = [];
            queueNames = [];
            isPlaying = false;
            dispatcher = null;
            voiceChannel = null;
            skipReq = 0;
            skippers = [];
            client.user.setActivity("Entrez " + prefix + "help pour l'aide.");
          }
        });
      } else {
        members = voiceChannel.members;
        if(timer != null){
          timer.stop()
          timer = null;
        }
      }
    }
  }
})


client.on('ready', function () {
  if(client.user)
  client.user.setActivity("Entrez " + prefix + "help pour l'aide.");
  console.log('Bot prêt !');
});

function skip_song() {
  dispatcher.end();
}

function playMusic(id, message) {
  voiceChannel = message.member.voiceChannel || voiceChannel;
  if (voiceChannel != null) {
    connected = 1;
    voiceChannel.join()
    .then(function(connection) {
      stream = ytdl("https://www.youtube.com/watch?v=" + id, {
        filter: 'audioonly'
      });
      skipReq = 0;
      skippers = [];

      client.user.setActivity(queueNames[0]);

      dispatcher = connection.playStream(stream, streamOptions);
      dispatcher.on('end', function() {
        skipReq = 0;
        skippers = [];
        queue.shift();
        queueNames.shift();
        if (queue.length === 0) {
          client.user.setActivity("Entrez " + prefix + "help pour l'aide.");
          if(connected) message.channel.send("Fin de la playlist.");
          if(dispatcher != null)
          dispatcher.destroy();
          queue = [];
          queueNames = [];
          isPlaying = false;
          dispatcher = null;
          skipReq = 0;
          skippers = [];
        } else {
          playMusic(queue[0], message);
          if(connected) message.channel.send("Passage à la musique : **" + queueNames[0] + "**.");
        }
      });
    });
  } else {
    message.reply(" vous, ou le bot, devez être présent dans un channel audio pour pouvoir faire ça !");
  }
}

function shuffle(array1,array2) {
  var currentIndex = array1.length;
  var randomIndex, temporaryValue1, temporaryValue2;

  while (currentIndex) {

    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    temporaryValue1 = array1[currentIndex];
    temporaryValue2 = array2[currentIndex];
    array1[currentIndex] = array1[randomIndex];
    array2[currentIndex] = array2[randomIndex];
    array1[randomIndex] = temporaryValue1;
    array2[randomIndex] = temporaryValue2;
  }
}

function add_to_queue(strID) {
  if (youtube.isYoutube(strID)) {
    queue.push(getYouTubeID(strID));
  } else {
    queue.push(strID);
  }
}
