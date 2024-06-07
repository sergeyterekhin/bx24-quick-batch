/* 
*  function complexBatch
*  using Bitrix24 REST API
*  @param 	 mixed commands: Array or Object of REST methods
*  @param function callback: a Callback function for handling REST result; getting param: an object with result
*  @param  boolean	   sync: Sync or Async Batch calling
*  @param  boolean getCount: Boolean param for getting rows count
*  @return  object  results: An object with all results. Keys of object is (key + "_n"), where n = 0 ... infinity, step 1
*  usage:
*  BX24.complexBatch({
*	deals:['crm.deal.list',{select:["ID"]}],
*	leads:['crm.lead.list',{}]
*  });
*/

/* 
*  function syncBatch
*  using Bitrix24 REST API
*  @param   array commands: Array of objects of REST methods for BX24.callBatch calling
*  @param boolean	  sync: Sync or Async Batch calling
*/

if(window.BX24) {
	window.BX24.complexBatch = function(commands, callback, joinResult=false, sync = true, getCount = true) {
		// Step 0: check params
		if(!(commands && typeof commands === "object")) {
			return undefined;
		} else {
			if(Array.isArray(commands) && !commands.length) return undefined;
		}
		// Step 1: transform @commands into array of objects like {key: method, ...}
		var commandsArray = [],
			count = 0,
			batch = {};
			
		if(Array.isArray(commands)) {
			commands.forEach(function(command){
				batch[count++] = command;
				if(count % 50 == 0) {
					commandsArray.push(batch);
					batch = {};
				}
			});
			if(count % 50 != 0) commandsArray.push(batch);
		} else {
			for(var key in commands) {
				batch[key] = commands[key];
				if(++count % 50 == 0) {
					commandsArray.push(batch);
					batch = {};
				}
			}
			if(count % 50 != 0) commandsArray.push(batch);
		}
		// Step 2: get rows count
		if(getCount) {

			BX24.syncBatch(commandsArray, true, function(res){
				var commandsArrayWithCount = [],
					commandsWithCount = {},
					completeCommands = {};

				//перебор всех BX запросов от пользователя 
				for(var key in res) {
					
					//если ответ содержит больше 50 эл. выполняй блок иначе записывай данные как полученные
					if(res[key].more()) {
						const resultResponse=res[key].data();
						let resultKey="";
						let resultFirstId=null;
						commandsWithCount={};
						
						// если ответ обертывает данные внутрь объекта, то получаем путь включая этот объект, иначе обычный путь
						if(!Array.isArray(resultResponse)) {
							const fieldObj=Object.keys(resultResponse)[0];
							const firstResponseValue=resultResponse[fieldObj][0];
							resultKey="["+fieldObj+"][49]["+ (Object.keys(firstResponseValue).includes("ID") ? "ID" : "id") +"]";
							resultFirstId=Object.keys(firstResponseValue).includes("ID") ? resultResponse[fieldObj][49]['ID'] : resultResponse[fieldObj][49]['id']; 
						} else {
							resultKey="[49]["+(Object.keys(resultResponse[0]).includes("ID")?"ID":"id")+"]";
							resultFirstId=Object.keys(resultResponse[0]).includes("ID") ? resultResponse[49]['ID'] : resultResponse[49]['id'];
						}

						//строим батчи в зависимости от кол-ва элементов вернувшихся в @Step 1
						for(var index=0; index<Math.ceil(res[key].total()/50);index++){
							if (index>0){
								let paramReq=JSON.parse(JSON.stringify(res[key].query.params));
								if (!paramReq.filter) paramReq.filter={};
								if (paramReq.hasOwnProperty("FILTER")){
									paramReq.filter=paramReq["FILTER"];
									delete paramReq["FILTER"];	
								}
								delete paramReq.order;
								delete paramReq["ORDER"];

								if (index==1) {
									paramReq.filter['>ID']=resultFirstId;
								} else {
									paramReq.filter['>ID']="$result[" + key + "_" + (index-1) + "]"+resultKey;
								}

								commandsWithCount[key + "_" + index] = [res[key].query.method, { ...paramReq, ...{start:-1} }];
								
								if (Object.keys(commandsWithCount).length>=50 || (index+1)==Math.ceil(res[key].total()/50)) {
									commandsArrayWithCount.push(commandsWithCount);
									commandsWithCount={};
								}

							} else completeCommands[key + "_" + index] = res[key];
						}
					} else completeCommands[key + "_0"] = res[key];	
				}

				if(commandsArrayWithCount.length) {
					BX24.syncBatch(commandsArrayWithCount, sync, callback, completeCommands, joinResult);
				}
				else if(callback && typeof callback === "function" && !BX24.isEmptyObject(completeCommands)) {
					{
						if (joinResult) callback(completeCommands.complexMutation()); else callback(completeCommands);
					}
				}
			},joinResult);

		} else {
			BX24.syncBatch(commandsArray, sync, callback, {}, joinResult);
		}
	}

	window.BX24.syncBatch = function(commands, sync = false, callback, data = {}, joinResult=false) {
		if(sync) {
			BX24.callBatch(commands[0], function(res){
				for(var command in commands[0]) {
					if(commands[0][command][1] && typeof commands[0][command][1] == "object") res[command].query.params = commands[0][command][1];
					else res[command].query.params = {};
				}
				
				data = { ...data, ...res };
				
				if(commands[1]){
					const responseProperty=Object.keys(res);
					const responseLastPropName=responseProperty[responseProperty.length-1]; // берем последнее свойство объекта ответа
					const requestFirstPropName=Object.keys(commands[1])[0];
					const splitedData={first:responseLastPropName?.split("_"), second:requestFirstPropName?.split("_")};

					if (splitedData.first[0]==splitedData.second[0] && parseInt(splitedData.first[1])==parseInt(splitedData.second[1])-1){
						
						let responseLastData=res[responseLastPropName].data();
						if (!Array.isArray(responseLastData)) {
							const fieldObj=Object.keys(responseLastData)[0];
							responseLastData=responseLastData[fieldObj][responseLastData[fieldObj].length-1];
						} else {
							responseLastData=responseLastData[responseLastData.length-1];
						}

						if (responseLastData.hasOwnProperty('ID'))
							commands[1][requestFirstPropName][1].filter['>ID']=responseLastData['ID'];
						else
							commands[1][requestFirstPropName][1].filter['>ID']=responseLastData['id'];
					
					}

					BX24.syncBatch(commands.slice(1), sync, callback, data,joinResult);
				}
				else if (callback && typeof callback === "function" && !BX24.isEmptyObject(data)) {
					if (joinResult) callback(data.complexMutation()); else callback(data);
				}
			});
		} else {
			commands.forEach(function(command) {
				BX24.callBatch(command, function(res) {
					if(callback && typeof callback === "function") {
						if (joinResult) callback(data.complexMutation()); else callback(data);
					}
				});
			});
			if(callback && typeof callback === "function" && !BX24.isEmptyObject(data)) {
				if (joinResult) callback(data.complexMutation()); else callback(data);
			}
		}
	}
	
	window.BX24.isEmptyObject = function(obj) {
		for(var prop in obj) {
			if(obj.hasOwnProperty(prop)) return false;
		}
		return JSON.stringify(obj) === JSON.stringify({});
	}


	/**
	 * Метод объекта, который работает с результатом ComplexBatch. 
	 * Он собирает данные объекта вида (res, res_1, res_2) в новый вид res, 
	 * который содержит все содержимое data() вида res_N.
	 *(В случае если length содержимого получится 1, то вернет его содержимое)
	*/
	Object.defineProperty(Object.prototype,"complexMutation",{
		enumerable:false,
		value:function(){
			let outputData={};
			try {
				for(let key in this){
					let propertyName=key.split("_")[0];
					let result;
					if (this[key].answer.error!=undefined) result={error:this[key].answer.error}; 
					else result=this[key].answer.result;
					
					if (!outputData.hasOwnProperty(propertyName)) outputData[propertyName]=[];
					
					if(result!=null && !Array.isArray(result) && Object.keys(result).length==1) {
						const fieldObj=Object.keys(result)[0];
						if (fieldObj!="error") result=result[fieldObj];
					}

					if (Array.isArray(result) || outputData[propertyName].length>0) 
						outputData[propertyName]=outputData[propertyName].concat(result);
					else outputData[propertyName]=result;
				}
				//if (Object.keys(outputData).length==1) return outputData[Object.entries(outputData)[0][0]];
				return outputData;
			 } catch(e){
			  	return false;
			}
		}
	});
}