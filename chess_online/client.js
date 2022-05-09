(function () {
    let d = document,
        w = window,
        dd = d.documentElement,
        db = d.body,
        dc = d.compatMode == 'CSS1Compat',
        dx = dc ? dd: db;
 
    w.CHAT = {
        username:null,
        userid:null,
        socket:null,
        game:null,
        audios: { step: {src: 'https://img.tukuppt.com/newpreview_music/08/98/86/5c88c43e9920a76562.mp3',
                         play: function() {
                                    if(CHAT.audios.step.canplay){
                                        let audio = new Audio(CHAT.audios.step.src); 
                                        audio.currentTime = 0;
                                        new Audio(CHAT.audios.step.src).play();    
                                    }
                               }
                        },
                  eat: {src: 'https://img.tukuppt.com/newpreview_music/09/03/89/5c8aed617ca9788822.mp3',
                        play: function() {
                                    if(CHAT.audios.eat.canplay){
                                        let audio = new Audio(CHAT.audios.eat.src); 
                                        audio.currentTime = 0;
                                        new Audio(CHAT.audios.eat.src).play();    
                                    }
                              }
                       }      
        },
        //退出，本例只是一个简单的刷新
        logout:function(){
            //this.socket.disconnect();
            location.reload();
        },
        //显示/关闭本局游戏结束提示
        showReGame:function(isShow, text){
            d.getElementById('tip').className = isShow ? 'active' : '';
            d.getElementById('tipPara').innerText = text;
        },
        //生成唯一用户id
        genUid:function(){
            return "player_" + guid() + "_" + new Date().getTime();
        },
        //更新系统消息，本例中在用户进入、退出的时候调用
        updateSysMsg:function(o, action){
            //当前在线用户列表
            let onlineUsers = o.onlineUsers;
            //新加入用户的信息
            let user = o.user;
 
            d.getElementById("onlinecount").innerHTML = '在线：<span>'+Object.keys(onlineUsers).length+' </span>人';
 
            //添加系统消息
            let messageDom = d.getElementById('message'),
                newItem = d.createElement('div');
            newItem.innerHTML = '<div class="msg_system">玩家 “' + user.username + (action == ('login') ? '” 进入了房间' : '” 退出了房间') + '</div>';
            messageDom.appendChild(newItem);
            messageDom.scrollTop = messageDom.scrollHeight;
            if(d.getElementById('messageBox').className != 'active')
                d.getElementById('messageGuide').className = 'active';
        },
        //注册用户名
        usernameSubmit:function(){
            let username = d.getElementById("username").value;
            if(username){
                d.getElementById("username").value = '';
                d.getElementById('submitBtn').className = '';
                d.getElementById("home").className = '';
                this.init(username);
            }
            return false;
        },
        //检测用户名不能为空
        usernameCheck:function(dom){
            d.getElementById('submitBtn').className = dom.value ? 'active' : '';
        },
        //提交聊天消息内容
        messageSubmit:function(){
            let message = d.getElementById("broadcast").children[0].value;
            if(message && this.userid && this.socket){
                this.socket.emit('message', {userid: this.userid, username: this.username, message: message});
                d.getElementById("broadcast").children[0].value = '';
                d.getElementById("broadcast").children[1].className = 'btn';
            }
            return false;
        },
        //检测发送的消息不能为空
        messageCheck:function(dom){
            d.getElementById('broadcast').children[1].className = dom.value ? 'btn active' : 'btn';
        },
        //显示/关闭聊天消息框
        showMessageBox:function(){
            let dom = d.getElementById('messageBox');
            if(dom.className != 'active') {
                dom.className = 'active';
                d.getElementById('messageGuide').className = '';
            } else dom.className = '';
        },
        //初始化游戏系统
        init:function(username){

            this.userid = this.genUid();
            this.username = username;

            this.initChessBooard();
            //连接websocket后端服务器
            this.socket = io.connect('ws://119.3.144:3333/');
 
            //告诉服务器端有用户登录
            this.socket.emit('login', {userid:this.userid, username:this.username, ch:0, cw:0});
 
            //监听新用户登录
            this.socket.on('login', (o) => {
                CHAT.updateSysMsg(o, 'login');
                if(CHAT.userid == o.user.userid){
                    if(o.started) CHAT.start(o);
                    CHAT.showReady(!(o.chessInfo && o.chessInfo.players && o.chessInfo.players.master && o.chessInfo.players.visitor) ?
                                     o.chessInfo && o.chessInfo.players && Object.keys(o.chessInfo.players).find(camp => o.chessInfo.players[camp] == o.user.userid) ? 
                                     'selfReady' : 'canJoin' : 'allready');
                    CHAT.showToolBoard(o);

                    this.socket.on('message', function(o){
                        let isMySelf = o.userid == CHAT.userid,
                            messageDom = d.getElementById('message'),
                            newItem = d.createElement('div');
                        newItem.innerHTML = '<div class="msg_user '+(isMySelf ? 'self' : '')+'"><div class="msgavar"><span>' + (isMySelf ? '我' : o.username) + '</span></div><div class="msgContent"><span>' + o.message + '</span></div></div>';
                        messageDom.appendChild(newItem);
                        messageDom.scrollTop = messageDom.scrollHeight;
                        if(d.getElementById('messageBox').className != 'active')
                            d.getElementById('messageGuide').className = 'active';
                    });                    
                    
                    //监听用户加入游戏成为玩家
                    this.socket.on('joinGame', function(o){
                        CHAT.start(o);
                        CHAT.showReady(!(o.chessInfo.players && o.chessInfo.players.master && o.chessInfo.players.visitor) ? 
                                         o.chessInfo.players && Object.keys(o.chessInfo.players).find(camp => o.chessInfo.players[camp] == CHAT.userid) ?
                                         'selfReady' : 'canJoin' : 'allready');       
                        CHAT.showToolBoard(o);
                    });

                    //实时计时器
                    CHAT.socket.on('timeCounter', (o) => {
                        if(!CHAT.game) return;
                        let dom = d.getElementsByClassName('counter')[0].children[0], seconds = o.time%60;
                        str = `0${parseInt(o.time/60)}:${seconds >= 10 ? seconds : '0'+seconds}`;
                        dom.innerText = str;
                        if(o.time < 10) { 
                            dom.setAttribute('warn','');
                        } else if(dom.hasAttribute('warn')){
                            dom.removeAttribute('warn');
                        }
                        if(o.time == 0) {
                            if(CHAT.userid == o.turn) {
                                if(CHAT.game.currentDom) {
                                    CHAT.game.triggeredByTimeCounter = true;
                                    evt = d.createEvent('HTMLEvents');
                                    evt.initEvent('mouseup', true, true);
                                    CHAT.game.currentDom.dispatchEvent(evt);
                                } else {
                                    this.socket.emit('timeCounterChange');
                                }
                            }
                        }
                    });

                    //棋权交替给当前执棋人
                    CHAT.socket.on('turnChange', function(o){
                        if(!CHAT.game) return;
                        CHAT.game.turnCamp = o.turnCamp;
                    });

                    //监听当前执棋人执子
                    CHAT.socket.on('mousedown', (o) => {
                        if(!CHAT.game) return;
                        CHAT.game.currentDom = CHAT.game.chess[o.camp][o.role].pieces[o.pIdx].element;
                        let dom = CHAT.game.currentDom;
                        dom.setAttribute('active','');
                        if(o.steps)
                            o.steps.forEach(pos => {
                                if(CHAT.game.myCamp == 'visitor') {
                                    pos.x = 8 - pos.x;
                                    pos.y = 9 - pos.y;
                                }
                                let ele = d.getElementById('dotTipArea').children[pos.y].getElementsByClassName('dotTip')[pos.x];
                                ele.setAttribute('show', '');
                                if(pos.rival) ele.setAttribute('rival', '');
                                if(CHAT.game.myCamp != o.camp) ele.setAttribute('warn', '');
                            });
                    });

                    //监听当前执棋人落子
                    CHAT.socket.on('mouseup', (o) => {
                        if(!CHAT.game) return;
                        let dom = CHAT.game.currentDom;
                        if(CHAT.game.myCamp == 'visitor') {
                            o.p.pos.x = 8 - o.p.pos.x;
                            o.p.pos.y = 9 - o.p.pos.y;
                            if(typeof o.p.pos.ox != 'undefined')
                                o.p.pos.ox = 8 - o.p.pos.ox;
                            if(typeof o.p.pos.oy != 'undefined')
                                o.p.pos.oy = 9 - o.p.pos.oy;
                            if(typeof o.rival != 'undefined'){
                                o.rival.pos.x = 8 - o.rival.pos.x;
                                o.rival.pos.y = 9 - o.rival.pos.y;
                            }
                        }
                        if(o.isStep){
                            if(typeof o.rival != 'undefined'){
                                let rival = CHAT.game.chess[o.rival.camp][o.rival.role].pieces[o.rival.pIdx], 
                                    eatDir = o.rival.pos.y< o.p.pos.oy ? 'eat': 'eat_reverse';
                                dom.setAttribute(eatDir, '');
                                CHAT.game.eating = true;
                                let game = CHAT.game;
                                setTimeout(() => {
                                    dom.removeAttribute(eatDir);
                                    dom.removeAttribute('active');
                                    d.getElementById('dotArea').removeChild(rival.element);
                                    game.eating = false;
                                    if(CHAT.audios.eat.canplay){
                                        let audio = new Audio(CHAT.audios.eat.src); 
                                        audio.currentTime = 0;
                                        CHAT.audios.eat.play();    
                                    }                                        
                                    if(o.isOver) {
                                        game.terminal();
                                        CHAT.showReady('canJoin');
                                        CHAT.showToolBoard();
                                        CHAT.showReGame(true, {master: '红方', visitor: '黑方'}[o.p.camp]+'胜！');
                                    }                                                   
                                }, 1000);       
                            }else { 
                                dom.removeAttribute('active');
                                CHAT.audios.step.play();
                            }                             
                        }else{
                            dom.removeAttribute('active');
                            CHAT.audios.step.play();
                            if(CHAT.game.triggeredByTimeCounter)
                                this.socket.emit('timeCounterChange');
                        }
                        dom.style.left = (1 / 8 * 100 * o.p.pos.x) + '%';
                        dom.style.top = (1 / 9 * 100 * o.p.pos.y) + '%'; 
                        CHAT.game.currentDom = null;
                        Array.prototype.forEach.call(d.getElementById('dotTipArea').getElementsByClassName('dotTip'), ele => {
                            ele.removeAttribute('show');
                            ele.removeAttribute('rival');
                            ele.removeAttribute('warn');
                        });
                        if(CHAT.game.triggeredByTimeCounter) 
                            CHAT.game.triggeredByTimeCounter = false;
                    });
                }
            });

            //监听用户退出
            this.socket.on('logout', function(o){
                CHAT.updateSysMsg(o, 'logout');
                if(o.isOver && CHAT.game) {
                    CHAT.game.terminal();
                    CHAT.showReady('canJoin');
                    CHAT.showToolBoard();
                    CHAT.showReGame(true, '有玩家离线。');
                }  
            });
        },
        //初始化渲染棋盘元素节点
        initChessBooard: function(){
            let htmlStr = '', dotTipStr = '';
    
            for (let i = 0; i < 9; i++) {
                htmlStr += '<div>';
                for (let j = 0; j < 8; j++) {
                    htmlStr += '<span></span>';
                }
                htmlStr += '</div>';
            }
            d.getElementById('backArea').innerHTML = htmlStr;
    
            for (let i = 0; i < 10; i++) {
                dotTipStr += '<div>';
                for (let j = 0; j < 9; j++) {
                    dotTipStr += '<div class="dotTip"><div></div></div>';
                }
                dotTipStr += '</div>';
            }
            d.getElementById('dotTipArea').innerHTML = dotTipStr;
        },
        //重置并生成新的棋局对象
        start: function(o) {
            if(this.game)
                this.game.terminal();
            this.game = new Start(o);
        },
        //用户申请成为本局玩家
        joinGame: function() {
            this.socket.emit('joinGame', {userid: this.userid});
        },
        //显示/关闭申请弹框
        showReady: function(state) {
            d.getElementById('readyArea').setAttribute('state', state);
        },
        //显示/关闭辅助信息栏
        showToolBoard(o) {
            let avatars = d.getElementsByClassName('avatar');
            if(CHAT.game && o.chessInfo && o.chessInfo.players) {
                let url = { master: 'https://img2.baidu.com/it/u=3591908009,2813352222&fm=253&fmt=auto&app=138&f=JPEG?w=500&h=501',
                            visitor: 'https://gimg2.baidu.com/image_search/src=http%3A%2F%2Finews.gtimg.com%2Fnewsapp_bt%2F0%2F11500073221%2F1000&refer=http%3A%2F%2Finews.gtimg.com&app=2002&size=f9999,10000&q=a80&n=0&g=0n&fmt=auto?sec=1654003792&t=0399b3cdc4e28545ca1fe94d717fe665'},
                    myCamp = CHAT.game.myCamp, camp = {master: 'visitor', visitor: 'master'}[myCamp];
                    avatars[0].children[0].children[0].innerHTML = o.chessInfo.players[camp] ? '<span '+camp+' style="background-image: url('+url[camp]+');"></span>' : '';
                    avatars[0].children[0].children[1].innerText = o.chessInfo.players[camp] ? o.onlineUsers && o.onlineUsers[o.chessInfo.players[camp]] : '';
                    avatars[1].children[0].children[0].innerHTML = o.chessInfo.players[myCamp] ? '<span '+myCamp+' style="background-image: url('+url[myCamp]+');"></span>' : '';
                    avatars[1].children[0].children[1].innerText = o.chessInfo.players[myCamp] ? o.onlineUsers && o.onlineUsers[o.chessInfo.players[myCamp]] : '';
            } else {
                Array.prototype.forEach.call(avatars, ele => {
                    ele.children[0].children[0].innerHTML = '';
                    ele.children[0].children[1].innerText = '';
                });
            }
        }
    };
    //通过“回车”提交用户名
    d.getElementById("username").onkeydown = function(e) {
        e = e || event;
        if (e.keyCode === 13) {
            CHAT.usernameSubmit();
        }
    };

    //通过“回车”提交聊天消息
    d.getElementById("broadcast").children[0].onkeydown = function(e) {
        e = e || event;
        if (e.keyCode === 13) {
            CHAT.messageSubmit();
        }
    };

    //初始化音效属性
    Object.keys(CHAT.audios).forEach(action => {
        CHAT.audios[action].sound = new Audio(CHAT.audios[action].src);
        CHAT.audios[action].sound.oncanplay = () => {           
            CHAT.audios[action].canplay = true;
        }
    });

    //游戏构造函数，初始化棋局和棋子信息
    function Start(o){
        //当前用户本局中隶属阵营
        this.myCamp = Object.keys(o.chessInfo.players).find(camp => o.chessInfo.players[camp] == CHAT.userid) || 'master';
        //本局棋子信息（根据隶属阵营是主是客来转换棋子位置信息）
        this.chess = convertChess.call(this);
        //当前棋权的阵营
        this.turnCamp = Object.keys(o.chessInfo.players).find(camp => o.chessInfo.players[camp] == o.chessInfo.turn);
        //辅助对象，用来保存当前处于活跃状态的棋子元素节点
        this.currentDom;
        //辅助属性，用来记录当前计时器重置行为的触发方式（计时消耗完毕或当前执棋人走完一步）
        this.triggeredByTimeCounter;
        //辅助属性，用来记录上是在进行“吃子”的动作
        this.eating;

        initDoms.call(this, o);
        openToolBoard.call(this);

        //销毁本局游戏信息
        this.terminal = function() {
            let dom = d.getElementsByClassName('counter')[0].children[0];
            dom.removeAttribute('warn');
            dom.innerText = '';
            d.getElementById('toolBoard').removeAttribute('turnCamp');
            d.getElementById('dotArea').innerHTML='';
            if(d.onmousemove) d.onmousemove = null;
            if(d.ontouchmove) d.ontouchmove = null;
            if(d.onmouseup) d.onmouseup = null;
            if(d.ontouchend) d.ontouchend = null;
            CHAT.game = null;
        }

        //初始化渲染棋子元素节点
        function initDoms(o) {
            let chess = o.chessInfo.chess;
            for (let camp in chess) {
                for (let role in chess[camp]) {
                    chess[camp][role].pieces.forEach((p, pIdx) => {
                        let newItem = d.createElement('div');
                        newItem.className = `piece ${camp}`;
                        newItem.innerHTML = '<div><div text="'+chess[camp][role].text+'"></div></div>';
                        newItem.style.left = (1 / 8 * 100 * p.x) + '%';
                        newItem.style.top = (1 / 9 * 100 * p.y) + '%';
                        p.element = newItem;
                        d.getElementById('dotArea').appendChild(newItem);
                        if(o.chessInfo.players[camp] !== CHAT.userid) return;
                        let dom = newItem.children[0];
                        let deviceEvents = [{down: 'onmousedown', move: 'onmousemove', up: 'onmouseup', getPos: getMousePos},
                                            {down: 'ontouchstart', move: 'ontouchmove', up: 'ontouchend', getPos: getTouchPos}];
                        for(let i = 0; i < deviceEvents.length; i++) {
                            dom[deviceEvents[i].down] = (event) => {
                                event.preventDefault();
                                console.log(deviceEvents[i].down)
                                if(!o.chessInfo.playerReady || this.turnCamp != camp || this.eating) return; //在线版此处需修改
                                
                                CHAT.socket.emit('mousedown', {camp: camp, role: role, pIdx: pIdx});
                                
                                newItem.setAttribute('active','');
                                let opos = deviceEvents[i].getPos(event);
                                newItem.style.left = `${newItem.offsetLeft}px`;
                                newItem.style.top = `${newItem.offsetTop}px`;
    
                                d[deviceEvents[i].move] = (e) => {
                                    e.preventDefault();
                                    let cpos = deviceEvents[i].getPos(e), distance = { x: cpos.x - opos.x, y: cpos.y - opos.y };
                                    newItem.style.left = `${Number(newItem.style.left.replace('px', '')) + distance.x}px`;
                                    newItem.style.top = `${Number(newItem.style.top.replace('px', '')) + distance.y}px`;
                                    opos = cpos;
                                }
                                d[deviceEvents[i].up] = () => {
                                    d[deviceEvents[i].move] = null;
                                    d[deviceEvents[i].up] = null;
                                    let pos;
                                    if(CHAT.game.myCamp == 'visitor'){
                                        pos = {
                                                left: newItem.parentNode.offsetWidth - newItem.offsetLeft, 
                                                top: newItem.parentNode.offsetHeight - newItem.offsetTop, 
                                                width: newItem.offsetWidth, 
                                                parentWidth: newItem.parentNode.offsetWidth, 
                                                parentHeight: newItem.parentNode.offsetHeight
                                            };
                                    }else pos = {left: newItem.offsetLeft, top: newItem.offsetTop, width: newItem.offsetWidth, parentWidth: newItem.parentNode.offsetWidth, parentHeight: newItem.parentNode.offsetHeight};
                                    CHAT.socket.emit('mouseup', {camp: camp, role: role, pIdx: pIdx, pos: pos});                                    
                                }                            
                            }
                        }                                               
                    });
                }
            }
        }

        //转换棋子位置
        function convertChess() {
            let chess = o.chessInfo.chess;
            if(this.myCamp == 'visitor') {
                for (let camp in chess) {
                    for (let role in chess[camp]) {
                        chess[camp][role].pieces.forEach((p, pIdx) => {
                            p.x = 8 - p.x;
                            p.y = 9 - p.y;
                        });
                    }
                }
            }
            return o.chessInfo.chess;
        }

        //显示辅助信息栏信息
        function openToolBoard() {
            d.getElementById('toolBoard').setAttribute('turnCamp', this.turnCamp);
            observeValue(this, 'turnCamp', () => {
                d.getElementById('toolBoard').setAttribute('turnCamp', this.turnCamp);
            });
        }

        //辅助方法，监听某对象元素变化
        function observeValue(obj, key, fn) {
            let value = obj[key];
            Object.defineProperty(obj, key, { 
                get: function(){
                    return value;
                },
                set: function(newval){
                    value = newval;
                    fn && fn();
                }
            })
        }
    
        //获取鼠标位置
        function getMousePos(e) {
            let pageX = e.pageX || e.clientX + (dd ? dd.scrollLeft : db.scrollLeft),
                pageY = e.pageY || e.clientY + (dd ? dd.scrollTop : db.scrollTop);
    
            return {x: pageX, y: pageY};
        }
    
        //获取移动端触点位置
        function getTouchPos(e) {
            let pageX = e.touches[0].pageX || e.touches[0].clientX + (dd ? dd.scrollLeft : db.scrollLeft),
                pageY = e.touches[0].pageY || e.touches[0].clientY + (dd ? dd.scrollTop : db.scrollTop);
    
            return {x: pageX, y: pageY};
        }
    }

    //辅助方法，生成guid
    function guid() {
        return ('' + [1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, ch => {
            let c = Number(ch);
            return (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        });
    }
    
    //监听屏幕尺寸变化，自适应改变棋盘棋子的大小
    setHTMLFontsize();

    w.onresize = () => {
        setHTMLFontsize();
    };

    function setHTMLFontsize(){
        let rate = (500*1.125+40)/540,
            heightLarger = dd.clientHeight > dd.clientWidth * rate,
            standard = heightLarger ? dd.clientWidth : dd.clientHeight / rate; 
        dd.style.fontSize = standard*100/600 + 'px';
        d.getElementById('area').setAttribute('direction', heightLarger ? 'heightMode' : 'widthMode')
    }
})();