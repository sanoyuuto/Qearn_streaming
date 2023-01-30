/**
 * The copyright in this software is being made available under the BSD License,
 * included below. This software may be subject to other third party and contributor
 * rights, including patent rights, and no such rights are granted under this license.
 *
 * Copyright (c) 2013, Dash Industry Forum.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification,
 * are permitted provided that the following conditions are met:
 *  * Redistributions of source code must retain the above copyright notice, this
 *  list of conditions and the following disclaimer.
 *  * Redistributions in binary form must reproduce the above copyright notice,
 *  this list of conditions and the following disclaimer in the documentation and/or
 *  other materials provided with the distribution.
 *  * Neither the name of Dash Industry Forum nor the names of its
 *  contributors may be used to endorse or promote products derived from this software
 *  without specific prior written permission.
 *
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS AS IS AND ANY
 *  EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 *  WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED.
 *  IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT,
 *  INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT
 *  NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
 *  PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
 *  WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */

var Qlearning_BitrateRule;
var cnty = 1;
var list_index = [];
var QoE = 0;
var reward = 0;
var each_reward = [];
var bitrate_utility =[];
var smooth_penalty = [];
var QoE_log = 0;
var reward_log = 0;
var each_reward_log = [];
var bitrate_utility_log =[];
var smooth_penalty_log = [];
var VIDEO_BIT_RATE = [2.5,5,8,16,30,45];//Mbps
var VIDEO_BIT_RATE_LOG = [0,0.69,1.16,1.85,2.48,2.89];
//var q_table = csv2Array("./csv2/q_table_TearsofSteel_005_085_sm3_rb200_bf01_lin.csv");
var q_table = csv2Array("./csv_45/q_table_TearsofSteel_005_085_sm2_rb100_bf01_12_lin_ver3.csv");
//var q_table = csv2Array("./csv2/q_table_TearsofSteel_005_085_sm2_rb150_bf01_12_lin_ver3.csv")
for(var i =0; i < 6; i++){
	for(var j =0; j < 17; j++){
		for(var k =0; k < 6; k++){
			list_index[list_index.length] = [i,j,k];
		}
	}
}

function csv2Array(filePath) { //csvﾌｧｲﾙﾉ相対ﾊﾟｽor絶対ﾊﾟｽ
        var csvData = new Array();
        var data = new XMLHttpRequest();
        data.open("GET", filePath, false); //true:非同期,false:同期
        data.send(null);

        var LF = String.fromCharCode(10); //改行ｺｰﾄﾞ
        var lines = data.responseText.split(LF);
        for (var i = 0; i < lines.length;++i) {
                var cells = lines[i].split(",");
                if( cells.length != 1 ) {
                        csvData.push(cells);
                }
        }
        return csvData;
}	

// Rule that selects possible bitrate
function Qlearning_BitrateRuleClass() {
    localStorage.setItem("bitrate0",0);
    let factory = dashjs.FactoryMaker;
    let SwitchRequest = factory.getClassFactoryByName('SwitchRequest');
    let MetricsModel = factory.getSingletonFactoryByName('MetricsModel');
    let StreamController = factory.getSingletonFactoryByName('StreamController');
    let context = this.context;
    let instance;

    function setup() {
    }

    // Always use lowest bitrate
    function getMaxIndex(rulesContext) {
        // here you can get some informations aboit metrics for example, to implement the rule
        let metricsModel = MetricsModel(context).getInstance();
        var mediaType = rulesContext.getMediaInfo().type;
        var metrics = metricsModel.getMetricsFor(mediaType, true);
        var mediaType_sano = rulesContext.getMediaType();

        // Get current bitrate
        let streamController = StreamController(context).getInstance();
        let abrController = rulesContext.getAbrController();
        let current = abrController.getQualityFor(mediaType, streamController.getActiveStreamInfo());

        let streamInfo = rulesContext.getStreamInfo();
	let streamId = streamInfo ? streamInfo.id : null;
	var isDynamic = streamInfo && streamInfo.manifestInfo ? streamInfo.manifestInfo.isDynamic : null;
        var throughputHistory = abrController.getThroughputHistory();
	var throughput = throughputHistory.getSafeAverageThroughput(mediaType_sano,isDynamic);
        localStorage.setItem("throughput", throughput);
	//var throughput_ave = throughputHistory.getAverageThroughput('video');
	//var buffer = document.getElementById( 'bufferLevel_Qlearning').innerText;
        var buffer = 0;
        if (cnty == 1){
		buffer =0;
	}else{
		buffer = localStorage.getItem("bufferLevel_Qlearning");
	}
	console.log(buffer);
        console.log(throughput/1000);

	//入力を求める
	var input_buffer = rounding_buffer(buffer);
	var input_throughput = rounding_throughput(throughput/1000);
	if (cnty == 1){
		var last_bitrate = 0;
		input_throughput = 0;
	}else{
		cnt2 = cnty-1;
		var last_bitrate = parseInt(localStorage.getItem("bitrate"+cnt2));
	}

       	var input = [input_buffer,input_throughput,last_bitrate];
        console.log(input);
	
	//入力のindex取得
	var index_num = list_index.findIndex( item => JSON.stringify( item )===JSON.stringify(input)); 
	//console.log(index_num);

	//Qテーブルを読み込む    
        var Row = q_table[index_num];
	console.log(Row.map(Number));

	//最大のindexの値を取得する
	var maxindex = maxIndex1(Row.map(Number));
	
        // Ask to switch to bitrate
	let switchRequest = SwitchRequest(context).create();
	
	if (cnty == 1 || buffer < 8){
		switchRequest.quality = 0;
	}else{
		switchRequest.quality = maxindex;
 	}
        console.log(switchRequest.quality);

	// local storageにビットレートをアップロードする    
        switchRequest.priority = SwitchRequest.PRIORITY.STRONG;
	if (mediaType == "video") {
		localStorage.setItem("bitrate"+cnty, switchRequest.quality);
		cnty = cnty +1 ;
	}
	
       // QoEを求める
       // reward = video quality - rebuffer penalty -smooth penalty
       reward = VIDEO_BIT_RATE[switchRequest.quality] - Math.abs(VIDEO_BIT_RATE[switchRequest.quality]-VIDEO_BIT_RATE[parseInt(localStorage.getItem("bitrate"+(cnty-2)))]);
       each_reward.push(reward);
       smooth_penalty.push(Math.abs(VIDEO_BIT_RATE[switchRequest.quality]-VIDEO_BIT_RATE[parseInt(localStorage.getItem("bitrate"+(cnty-2)))]));
       bitrate_utility.push(VIDEO_BIT_RATE[switchRequest.quality]);
       reward_log = VIDEO_BIT_RATE_LOG[switchRequest.quality] - Math.abs(VIDEO_BIT_RATE_LOG[switchRequest.quality]-VIDEO_BIT_RATE_LOG[parseInt(localStorage.getItem("bitrate"+(cnty-2)))]);
       each_reward_log.push(reward_log);
       smooth_penalty_log.push(Math.abs(VIDEO_BIT_RATE_LOG[switchRequest.quality]-VIDEO_BIT_RATE_LOG[parseInt(localStorage.getItem("bitrate"+(cnty-2)))]));
       bitrate_utility_log.push(VIDEO_BIT_RATE_LOG[switchRequest.quality]);
       console.log("=======================");
        return switchRequest;
    }

    function rounding_buffer(buffer_size) {
	if (buffer_size<5) {
            input_buffer=0;
	}else if (5  <= buffer_size && buffer_size < 14) {
            input_buffer=1;
	}else if (14  <= buffer_size && buffer_size < 16) { 
            input_buffer=2;
	}else if (16  <= buffer_size && buffer_size < 24) {
            input_buffer=3;
	}else if (24  <= buffer_size && buffer_size < 26.5) {
            input_buffer=4;
	}else{
            input_buffer=5;
        }
	return input_buffer;
	}

     function rounding_throughput(throughput_ave) {
	if (throughput_ave<2.5){
            input_throughput = 0;
	}else if ( 2.5  <= throughput_ave && throughput_ave < 5) {
            input_throughput = 1;
	}else if (5 <= throughput_ave && throughput_ave < 7.5) {
            input_throughput = 2;
	}else if (7.5 <= throughput_ave && throughput_ave < 10) {
            input_throughput = 3;
	}else if (10 <= throughput_ave && throughput_ave < 12.5) {
            input_throughput = 4;
	}else if (12.5 <= throughput_ave && throughput_ave < 14) {
            input_throughput = 5;
	}else if (14 <= throughput_ave && throughput_ave < 17.5) {
            input_throughput = 6;
	}else if (17.5 <= throughput_ave && throughput_ave < 22) {
            input_throughput = 7;
	}else if(22 <= throughput_ave && throughput_ave < 26.5){
            input_throughput = 8;
	}else if(26.5 <= throughput_ave && throughput_ave < 30) {
            input_throughput = 9;
	}else if (30 <= throughput_ave && throughput_ave < 35) {
            input_throughput = 10;
	}else if (35 <= throughput_ave && throughput_ave < 40) {
            input_throughput = 11;
	}else if (40 <= throughput_ave && throughput_ave < 45) {
            input_throughput = 12;
	}else if (45 <= throughput_ave && throughput_ave < 50) {
            input_throughput = 13;
	}else if (50 <= throughput_ave && throughput_ave < 55) {
            input_throughput = 14;
	}else if (55 <= throughput_ave && throughput_ave < 60) {
            input_throughput = 15;
	}else if ( isNaN(throughput_ave)) {
	    input_throughput = 0;
	}else{
            input_throughput = 16;
	}
	return input_throughput;
    }
    
    function maxIndex1(a) {
	let index = 0
	let value = -Infinity
	for (let i = 0, l = a.length; i < l; i++) {
		if (value < a[i]) {
			value = a[i]
			index = i
		}
	}
	return index
   }
 
    instance = {
        getMaxIndex: getMaxIndex
    };	
	
    setup();

    return instance;
}

Qlearning_BitrateRuleClass.__dashjs_factory_name = 'Qlearning_BitrateRule';
Qlearning_BitrateRule = dashjs.FactoryMaker.getClassFactory(Qlearning_BitrateRuleClass);

