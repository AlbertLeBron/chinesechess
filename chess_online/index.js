const { Console } = require('console');

let app = require('express')();
let http = require('http').Server(app);
let io = require('socket.io')(http, {cors: true});

app.get('/', function(req, res){
    res.send('<h1>Welcome Realtime Server</h1>');
});
 
//在线玩家
let onlineUsers = {};
//游戏句柄
let game=null;
 
io.on('connection', function(socket){
    console.log('某玩家已接入...');   
    //监听新用户加入
    socket.on('login', function(obj){
        //将新加入用户的唯一标识当作socket的名称，后面退出的时候会用到
        socket.name = obj.userid;
        let gameInfo;
        if(!onlineUsers.hasOwnProperty(obj.userid)) {
            onlineUsers[obj.userid] = obj.username;
        }
        if(!game){
            gameInfo = {started: false};
        }else{
            gameInfo = {started: true, chessInfo: game.chessInfo};
        }
         
        //向所有客户端广播用户加入
        io.emit('login', Object.assign({onlineUsers:onlineUsers, user:obj}, gameInfo));
        console.log(obj.username+'加入了游戏');

        //获取用户发出的聊天内容
        socket.on('message', function(o){
            io.emit('message', o);
        });

        //监听用户发出参与本局游戏的申请
        socket.on('joinGame', function(o){
            if(game && game.chessInfo.players && 
               ((game.chessInfo.players.master && game.chessInfo.players.visitor) || 
                (game.chessInfo.players.master == o.userid || game.chessInfo.players.visitor == o.userid)))
                return;
            if(!game){
                console.log('重新开局');
                game = new Start();
            }
            game.newPlayer(obj.userid,obj.username);
            io.emit('joinGame', {onlineUsers: onlineUsers, user:obj, started: true, chessInfo: game.chessInfo});
        });
        
        //监听计时器是否重新计时（一方走完棋步后的棋权交换）
        socket.on('timeCounterChange', function(){
            if(!game) return;
            game.timeCounterChange();
        });
    
        //监听玩家执子事件（借此同步显示给其他用户）
        socket.on('mousedown', function(o){
            if(!game) return;
            let piece = game.chessInfo.chess[o.camp][o.role].pieces[o.pIdx];
            piece.active = true;
            io.emit('mousedown', Object.assign(o, {pos: {x: piece.x, y: piece.y}, steps: game.chessInfo.chess[o.camp][o.role].rule({x: piece.x, y: piece.y})}));
        });
    
        //监听玩家落子事件（借此同步显示给其他用户）
        socket.on('mouseup', function(o){
            if(!game) return;
            let piece = game.chessInfo.chess[o.camp][o.role].pieces[o.pIdx];
            piece.active = false; 
            
            let steps = game.chessInfo.chess[o.camp][o.role].rule({x: piece.x, y: piece.y}),
                step = steps.find(p => Math.sqrt(Math.pow(p.x - o.pos.left/o.pos.parentWidth*8, 2) + Math.pow(p.y - o.pos.top/o.pos.parentHeight*9, 2))<o.pos.width/o.pos.parentWidth*4),
                rival, isOver;
            if(typeof step != 'undefined'){
                if(typeof step.rival != 'undefined') {
                    step.rival.out = true;
                    rival = {camp: {master: 'visitor', visitor: 'master'}[o.camp], pos: {x: step.rival.x, y: step.rival.y}};
                    rivalMatch:
                    for(let role in game.chessInfo.chess[rival.camp]) {
                        let roleEntity = game.chessInfo.chess[rival.camp][role];
                        for(let i = 0; i < roleEntity.pieces.length; i++) {
                            if(roleEntity.pieces[i] === step.rival) {
                                Object.assign(rival, {role: role, pIdx: i});
                                break rivalMatch;
                            }
                        }
                    }
                    isOver = step.rival === game.chessInfo.chess[rival.camp].marshal.pieces[0];
                }
                o.pos = {ox: piece.x, oy: piece.y, x: step.x, y: step.y};    
                piece.x = step.x;
                piece.y = step.y;
                game.timeCounterChange();
            }else {
                o.pos = {x: piece.x, y: piece.y};
            }       
            
            io.emit('mouseup', {isStep: !!step, p: o, rival: rival, isOver: isOver});
            if(isOver) {
                game.terminal();
                console.log('胜负已分，此局结束。');
            }
        });
         
        //监听用户退出
        socket.on('disconnect', function(){
            //将退出的用户从在线列表中删除
            if(onlineUsers.hasOwnProperty(socket.name)) {
                //退出用户的信息
                let obj = {userid:socket.name, username:onlineUsers[socket.name]};
                 
                //从用户列表中删除当前用户信息
                delete onlineUsers[socket.name];
                 
                //向所有客户端广播用户退出（若为玩家中途退出，则强制终止本局游戏）
                let isOver = game && Object.keys(game.chessInfo.players).find(camp => game.chessInfo.players[camp] == socket.name);
                io.emit('logout', {onlineUsers:onlineUsers, user:obj, isOver: isOver});
                console.log(obj.username+'退出游戏');
                
                if(isOver){
                    game.terminal();
                    console.log('玩家中途退出，此局结束。');
                }
            }
        });
    });
     
    //游戏构造函数，初始化并定义新一局游戏的属性和方法
    function Start(){
        //全套棋子对象，包括阵营、角色、单个棋子的信息
        let chess = {
                master: {
                    marshal: {
                        text: '帥',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y },
                                        { x: pos.x - 1, y: pos.y },
                                        { x: pos.x, y: pos.y + 1 },
                                        { x: pos.x, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => p.x<=5 && p.x>=3 && p.y<=9 && p.y>=7 && !exisiPiece(chess.master, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.visitor, p);
                            });
                            let my = chess.master.marshal.pieces[0], rival = chess.visitor.marshal.pieces[0];
                            if(my.x == rival.x && !rival.out){
                                let marshalDuel = false;
                                for(let i = rival.y + 1; i < my.y; i++){
                                    marshalDuel = exisiPiece(chess.visitor, {x: my.x, y: i}) || exisiPiece(chess.master, {x: my.x, y: i});
                                    if(marshalDuel) break;
                                }
                                if(!marshalDuel) {
                                    nextPos.push({ x: rival.x, y: rival.y , rival: rival});
                                }
                            }
                            return nextPos;
                        },
                        pieces: [{x: 4, y: 9}]
                    },
                    bodyguard: {
                        text: '仕',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y + 1 },
                                        { x: pos.x + 1, y: pos.y - 1 },
                                        { x: pos.x - 1, y: pos.y + 1 },
                                        { x: pos.x - 1, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => p.x<=5 && p.x>=3 && p.y<=9 && p.y>=7 && !exisiPiece(chess.master, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.visitor, p);
                            });
                            return nextPos;
                        },
                        pieces: [{ x: 3, y: 9 }, { x: 5, y: 9 }]
                    },
                    minister: {
                        text: '相',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 2, y: pos.y + 2 },
                                        { x: pos.x + 2, y: pos.y - 2 },
                                        { x: pos.x - 2, y: pos.y + 2 },
                                        { x: pos.x - 2, y: pos.y - 2 }];
                            nextPos = nextPos.filter(p => p.x<=8 && p.x>=0 && p.y<=9 && p.y>=5 && !exisiAnyPiece({x: (pos.x + p.x)/2, y: (pos.y + p.y)/2}) && !exisiPiece(chess.master, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.visitor, p);
                            });
                            return nextPos;
                        },
                        pieces: [{ x: 2, y: 9 }, { x: 6, y: 9 }]
                    },
                    horse: {
                        text: '馬',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y + 2 },
                                        { x: pos.x - 1, y: pos.y + 2 },
                                        { x: pos.x + 1, y: pos.y - 2 },
                                        { x: pos.x - 1, y: pos.y - 2 },
                                        { x: pos.x - 2, y: pos.y + 1 },
                                        { x: pos.x - 2, y: pos.y - 1 },
                                        { x: pos.x + 2, y: pos.y + 1 },
                                        { x: pos.x + 2, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => p.x<=8 && p.x>=0 && p.y<=9 && p.y>=0 && !exisiPiece(chess.master, p) && 
                                    !(p.y == pos.y + 2 && exisiAnyPiece({x: pos.x, y: pos.y + 1})) &&
                                    !(p.y == pos.y - 2 && exisiAnyPiece({x: pos.x, y: pos.y - 1})) &&
                                    !(p.x == pos.x + 2 && exisiAnyPiece({x: pos.x + 1, y: pos.y})) &&
                                    !(p.x == pos.x - 2 && exisiAnyPiece({x: pos.x - 1, y: pos.y})));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.visitor, p);
                            });
                            return nextPos;
                        },
                        pieces: [{ x: 1, y: 9 }, { x: 7, y: 9 }]
                    },
                    chariot: {
                        text: '車',
                        rule: (pos) => {
                            let nextPos = [];
                            for(let i = pos.x - 1; i >= 0; i--) {
                                if(checkPos({x: i, y: pos.y})) break;
                            }
                            for(let i = pos.x + 1; i <= 8; i++) {
                                if(checkPos({x: i, y: pos.y})) break;
                            }
                            for(let i = pos.y - 1; i >= 0; i--) {
                                if(checkPos({x: pos.x, y: i})) break;
                            }
                            for(let i = pos.y + 1; i <= 9; i++) {
                                if(checkPos({x: pos.x, y: i})) break;
                            }

                            function checkPos(p) {
                                let toBreak;
                                if(!exisiAnyPiece(p)) {
                                    nextPos.push(p);
                                } else if(exisiPiece(chess.visitor, p)){
                                    nextPos.push({x: p.x, y: p.y, rival: exisiPiece(chess.visitor, p)});
                                    toBreak = true;
                                } else toBreak = true;
                                return toBreak;
                            }

                            return nextPos;
                        },
                        pieces: [{ x: 0, y: 9 }, { x: 8, y: 9 }]
                    },
                    cannon: {
                        text: '炮',
                        rule: (pos) => {
                            let nextPos = [];
                            for(let i = pos.x - 1; i >= 0; i--) {
                                if(checkPos({x: i, y: pos.y}, 'left')) break;
                            }
                            for(let i = pos.x + 1; i <= 8; i++) {
                                if(checkPos({x: i, y: pos.y}, 'right')) break;
                            }
                            for(let i = pos.y - 1; i >= 0; i--) {
                                if(checkPos({x: pos.x, y: i}, 'up')) break;
                            }
                            for(let i = pos.y + 1; i <= 9; i++) {
                                if(checkPos({x: pos.x, y: i}, 'down')) break;
                            }

                            function checkPos(p, direction) {
                                let toBreak;
                                if(!exisiAnyPiece(p)) {
                                    nextPos.push(p);
                                } else {
                                    let rp, rival;
                                    switch (direction) {
                                        case 'left': 
                                            for (let i = p.x - 1; i >= 0; i--){
                                                rival = exisiPiece(chess.visitor, {x: i, y: p.y});
                                                if (rival) {
                                                    rp = {x: i, y: p.y, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                        case 'right': 
                                            for (let i = p.x + 1; i <= 8; i++){
                                                rival = exisiPiece(chess.visitor, {x: i, y: p.y});
                                                if (rival) {
                                                    rp = {x: i, y: p.y, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                        case 'up': 
                                            for (let i = p.y - 1; i >= 0; i--){
                                                rival = exisiPiece(chess.visitor, {x: p.x, y: i});
                                                if (rival) {
                                                    rp = {x: p.x, y: i, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                        case 'down': 
                                            for (let i = p.y + 1; i <= 9; i++){
                                                rival = exisiPiece(chess.visitor, {x: p.x, y: i});
                                                if (rival) {
                                                    rp = {x: p.x, y: i, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                    }
                                    if(rp) nextPos.push(rp);
                                    toBreak = true;
                                }
                                return toBreak;
                            }

                            return nextPos;
                        },
                        pieces: [{ x: 1, y: 7 }, { x: 7, y: 7 }]
                    },
                    sodier: {
                        text: '兵',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y },
                                        { x: pos.x - 1, y: pos.y },
                                        { x: pos.x, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => ((p.x<=8 && p.x>=0 && p.y<=4 && p.y>=0) || (p.x<=8 && p.x>=0 && p.y<=9 && p.y>4 && p.x == pos.x && p.y == pos.y - 1)) && !exisiPiece(chess.master, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.visitor, p);
                            });

                            return nextPos;
                        },
                        pieces: [{ x: 0, y: 6 }, { x: 2, y: 6 }, { x: 4, y: 6 }, { x: 6, y: 6 }, { x: 8, y: 6 }]
                    }
                },
                visitor: {
                    marshal: {
                        text: '將',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y },
                                        { x: pos.x - 1, y: pos.y },
                                        { x: pos.x, y: pos.y + 1 },
                                        { x: pos.x, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => p.x<=5 && p.x>=3 && p.y<=2 && p.y>=0 && !exisiPiece(chess.visitor, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.master, p);
                            });
                            let my = chess.visitor.marshal.pieces[0], rival = chess.master.marshal.pieces[0];
                            if(my.x == rival.x && !rival.out){
                                let marshalDuel = false;
                                for(let i = my.y + 1; i < rival.y; i++){
                                    marshalDuel = exisiPiece(chess.visitor, {x: my.x, y: i}) || exisiPiece(chess.master, {x: my.x, y: i});
                                    if(marshalDuel) break;
                                }
                                if(!marshalDuel) {
                                    nextPos.push({ x: rival.x, y: rival.y , rival: rival});
                                }
                            }
                            return nextPos;
                        },
                        pieces: [{ x: 4, y: 0 }]
                    },
                    bodyguard: {
                        text: '士',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y + 1 },
                                        { x: pos.x + 1, y: pos.y - 1 },
                                        { x: pos.x - 1, y: pos.y + 1 },
                                        { x: pos.x - 1, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => p.x<=5 && p.x>=3 && p.y<=2 && p.y>=0 && !exisiPiece(chess.visitor, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.master, p);
                            });
                            return nextPos;
                        },
                        pieces: [{ x: 3, y: 0 }, { x: 5, y: 0 }]
                    },
                    minister: {
                        text: '象',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 2, y: pos.y + 2 },
                                        { x: pos.x + 2, y: pos.y - 2 },
                                        { x: pos.x - 2, y: pos.y + 2 },
                                        { x: pos.x - 2, y: pos.y - 2 }];
                            nextPos = nextPos.filter(p => p.x<=8 && p.x>=0 && p.y<=4 && p.y>=0 && !exisiAnyPiece({x: (pos.x + p.x)/2, y: (pos.y + p.y)/2}) && !exisiPiece(chess.visitor, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.master, p);
                            });
                            return nextPos;
                        },
                        pieces: [{ x: 2, y: 0 }, { x: 6, y: 0 }]
                    },
                    horse: {
                        text: '馬',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y + 2 },
                                        { x: pos.x - 1, y: pos.y + 2 },
                                        { x: pos.x + 1, y: pos.y - 2 },
                                        { x: pos.x - 1, y: pos.y - 2 },
                                        { x: pos.x - 2, y: pos.y + 1 },
                                        { x: pos.x - 2, y: pos.y - 1 },
                                        { x: pos.x + 2, y: pos.y + 1 },
                                        { x: pos.x + 2, y: pos.y - 1 }];
                            nextPos = nextPos.filter(p => p.x<=8 && p.x>=0 && p.y<=9 && p.y>=0 && !exisiPiece(chess.visitor, p) && 
                                    !(p.y == pos.y + 2 && exisiAnyPiece({x: pos.x, y: pos.y + 1})) &&
                                    !(p.y == pos.y - 2 && exisiAnyPiece({x: pos.x, y: pos.y - 1})) &&
                                    !(p.x == pos.x + 2 && exisiAnyPiece({x: pos.x + 1, y: pos.y})) &&
                                    !(p.x == pos.x - 2 && exisiAnyPiece({x: pos.x - 1, y: pos.y})));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.master, p);
                            });
                            return nextPos;
                        },
                        pieces: [{ x: 1, y: 0 }, { x: 7, y: 0 }]
                    },
                    chariot: {
                        text: '車',
                        rule: (pos) => {
                            let nextPos = [];
                            for(let i = pos.x - 1; i >= 0; i--) {
                                if(checkPos({x: i, y: pos.y})) break;
                            }
                            for(let i = pos.x + 1; i <= 8; i++) {
                                if(checkPos({x: i, y: pos.y})) break;
                            }
                            for(let i = pos.y - 1; i >= 0; i--) {
                                if(checkPos({x: pos.x, y: i})) break;
                            }
                            for(let i = pos.y + 1; i <= 9; i++) {
                                if(checkPos({x: pos.x, y: i})) break;
                            }

                            function checkPos(p) {
                                let toBreak;
                                if(!exisiAnyPiece(p)) {
                                    nextPos.push(p);
                                } else if(exisiPiece(chess.master, p)){
                                    nextPos.push({x: p.x, y: p.y, rival: exisiPiece(chess.master, p)});
                                    toBreak = true;
                                } else toBreak = true;
                                return toBreak;
                            }

                            return nextPos;
                        },
                        pieces: [{ x: 0, y: 0 }, { x: 8, y: 0 }]
                    },
                    cannon: {
                        text: '炮',
                        rule: (pos) => {
                            let nextPos = [];
                            for(let i = pos.x - 1; i >= 0; i--) {
                                if(checkPos({x: i, y: pos.y}, 'left')) break;
                            }
                            for(let i = pos.x + 1; i <= 8; i++) {
                                if(checkPos({x: i, y: pos.y}, 'right')) break;
                            }
                            for(let i = pos.y - 1; i >= 0; i--) {
                                if(checkPos({x: pos.x, y: i}, 'up')) break;
                            }
                            for(let i = pos.y + 1; i <= 9; i++) {
                                if(checkPos({x: pos.x, y: i}, 'down')) break;
                            }

                            function checkPos(p, direction) {
                                let toBreak;
                                if(!exisiAnyPiece(p)) {
                                    nextPos.push(p);
                                } else {
                                    let rp, rival;
                                    switch (direction) {
                                        case 'left': 
                                            for (let i = p.x - 1; i >= 0; i--){
                                                rival = exisiPiece(chess.master, {x: i, y: p.y});
                                                if (rival) {
                                                    rp = {x: i, y: p.y, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                        case 'right': 
                                            for (let i = p.x + 1; i <= 8; i++){
                                                rival = exisiPiece(chess.master, {x: i, y: p.y});
                                                if (rival) {
                                                    rp = {x: i, y: p.y, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                        case 'up': 
                                            for (let i = p.y - 1; i >= 0; i--){
                                                rival = exisiPiece(chess.master, {x: p.x, y: i});
                                                if (rival) {
                                                    rp = {x: p.x, y: i, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                        case 'down': 
                                            for (let i = p.y + 1; i <= 9; i++){
                                                rival = exisiPiece(chess.master, {x: p.x, y: i});
                                                if (rival) {
                                                    rp = {x: p.x, y: i, rival: rival};
                                                    break;
                                                }
                                            }
                                            break;
                                    }
                                    if(rp) nextPos.push(rp);
                                    toBreak = true;
                                }
                                return toBreak;
                            }

                            return nextPos;
                        },
                        pieces: [{ x: 1, y: 2 }, { x: 7, y: 2 }]
                    },
                    sodier: {
                        text: '卒',
                        rule: (pos) => {
                            let nextPos = [{ x: pos.x + 1, y: pos.y },
                                        { x: pos.x - 1, y: pos.y },
                                        { x: pos.x, y: pos.y + 1 }];
                            nextPos = nextPos.filter(p => ((p.x<=8 && p.x>=0 && p.y<=9 && p.y>=5) || (p.x<=8 && p.x>=0 && p.y<5 && p.y>=0 && p.x == pos.x && p.y == pos.y + 1)) && !exisiPiece(chess.visitor, p));
                            nextPos.forEach(p => {
                                p.rival = exisiPiece(chess.master, p);
                            });

                            return nextPos;
                        },
                        pieces: [{ x: 0, y: 3 }, { x: 2, y: 3 }, { x: 4, y: 3 }, { x: 6, y: 3 }, { x: 8, y: 3 }]
                    }}
            };
        this.timeFlag;
        this.chessInfo = {chess: chess, players: {}};
        
        //用户申请成为本轮玩家时调用，绑定其隶属的阵营信息
        this.newPlayer = function(userid){
            let camp = 'master';
            if(!this.chessInfo.players.master) {
                camp = 'master';
                this.chessInfo.players.master = userid;
                this.chessInfo.turn = userid;
            } else if(!this.chessInfo.players.visitor) {
                camp = 'visitor';
                this.chessInfo.players.visitor = userid;
            }
            if(this.chessInfo.players.master && this.chessInfo.players.visitor && !this.chessInfo.playerReady){
                this.chessInfo.playerReady = true;
                this.counter();
            }
        }       
        
        //计时器
        this.counter = function() {
            clearTimeout(this.timeFlag);
            let num = 120, str = '';
            this.timeFlag = setInterval(() => {
                num--; 
                io.emit('timeCounter', {time: num, turn: this.chessInfo.turn});
            }, 1000);
        }
        
        //交换棋权时调用，更新棋权信息并重新计时
        this.timeCounterChange = function() {
            let players = this.chessInfo.players;
            for(let camp in players) {
                if(players[camp] != this.chessInfo.turn) {
                    this.chessInfo.turn = players[camp];
                    io.emit('turnChange', {turnCamp: camp});
                    break;
                }
            }
            this.counter();
        }

        //终止本局游戏
        this.terminal = function() {
            clearInterval(this.timeFlag);
            game = null;
        }
        
        //判断当前位置是否存在棋子
        function exisiAnyPiece(pos) {
            return exisiPiece(chess.master, pos) || exisiPiece(chess.visitor, pos);
        }

        //判断当前位置是否存在某一阵营的棋子
        function exisiPiece(campRoles, pos) {
            let exp;
            Object.keys(campRoles).forEach(r => {
                let exist = campRoles[r].pieces.some(p => {
                    let isExist = p.x == pos.x && p.y == pos.y && !p.out; 
                    if(isExist) exp = p;
                    return isExist;
                })
                if(exist) return;
            });
            return exp;
        }
    }
   
});
 
http.listen(3333, function(){
    console.log('listening on *:3333');
});