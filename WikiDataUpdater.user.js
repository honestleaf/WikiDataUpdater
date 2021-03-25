// ==UserScript==
// @name WikiDataUpdater
// @namespace Violentmonkey Scripts
// @match http*://warframe.huijiwiki.com/wiki/warframe%E4%B8%AD%E6%96%87%E7%BB%B4%E5%9F%BA:%E6%95%B0%E6%8D%AE%E6%94%AF%E6%8C%81
// @grant none
// @run-at document-idle
// @noframes
// ==/UserScript==
//<nowiki>
(function (mw, $) {
  'use strict';
  var wikiaUpdateJobs = [
    'Module:Void/data',
    'Module:Weapons/data',
    'Module:Icon/data',
    'Module:Warframes/data',
    'Module:Warframes/Conclave/data',
    'Module:Mods/data',
    'Module:Ability/data',
    'Module:Ability/Conclave/data',
    'Module:Arcane/data',
    'Module:Missions/data',
    'Module:Modular/data',
    'Module:Stances/data'
  ];
  var droptableUpdateJobs = [
    {
      title: 'Data:MissionDrop.tab',
      builder: missionDropBuilder,
      subJobs: [
        {
          key: 'missionRewards',
          builder: missionRewardsBuilder
        },
        {
          key: 'cetusRewards',
          builder: cetusRewardsBuilder
        },
        {
          key: 'solarisRewards',
          builder: solarisRewardsBuilder
        },
        {
          key: 'deimosRewards',
          builder: deimosRewardsBuilder
        },
        {
          key: 'sortieRewards',
          builder: sortieRewardsBuilder
        },
        {
          key: 'transientRewards',
          builder: transientRewardsBuilder
        },
        {
          key: 'keyRewards',
          builder: keyRewardsBuilder
        }
      ]
    },
    {
      title: 'Data:EnemyModDrop.tabx',
      builder: itemDropBuilder,
      subJobs: [
        {
          key: 'modByAvatar',
          builder: enemyDropTablesBuilder
        }
      ]
    },
    {
      title: 'Data:EnemyPartDrop.tabx',
      builder: itemDropBuilder,
      subJobs: [
        {
          key: 'blueprintByAvatar',
          builder: enemyDropTablesBuilder
        }
      ]
    },
    {
      title: 'Data:EnemyResourceDrop.tabx',
      builder: itemDropBuilder,
      subJobs: [
        {
          key: 'resourceByAvatar',
          builder: enemyDropTablesBuilder
        }
      ]
    },
    {
      title: 'Data:EnemySigilDrop.tabx',
      builder: itemDropBuilder,
      subJobs: [
        {
          key: 'sigilByAvatar',
          builder: enemyDropTablesBuilder
        }
      ]
    },
    {
      title: 'Data:EnemyAdditionalDrop.tabx',
      builder: itemDropBuilder,
      subJobs: [
        {
          key: 'additionalItemByAvatar',
          builder: enemyDropTablesBuilder
        }
      ]
    },
    {
      title: 'Data:ModDropByMod.tabx',
      builder: itemDropBuilder,
      subJobs: [
        {
          key: 'modByDrop',
          builder: rewardDropTablesBuilder
        }
      ]
    }
  ];
  var distinctNodePlanetMap = {
    'Vay Hek Frequency Triangulator': 'Earth',
    'Jordas Golem Assassinate': 'Eris',
    'Mutalist Alad V Assassinate': 'Eris',
    'Derelict Vault': 'Derelict'
  };
  var distinctNodeMtypeMap = {
    'Phorid Assassination': 'Assassination',
    'Fomorian Sabotage': 'Sabotage',
    'Mutalist Alad V Assassinate': 'Assassination',
    'Jordas Golem Assassinate': 'Assassination',
    Razorback: 'Assassination'
  };
  var wikiaUrl = 'https://warframe.fandom.com/api.php';
  var corsProxy = 'https://proud-rice-49c2.hl-service.workers.dev/?';
  var droptableUrl =
    'https://n8k6e2y6.ssl.hwcdn.net/repos/hnfvc0o3jnfvc873njb03enrf56.html';
  var editToken = mw.user.tokens.get('csrfToken');
  var missionRegex = /(.+?)\/(.+?) \((.+?)\) *(.*)/;
  var rotationRegex = /Rotation (A|B|C)/;
  var chanceRegex = /([0-9.]+)%/;
  var bountyTierRegex = /Level .+/;
  var bountyCompletionRegex = /(.+?) Completion(s|)/;
 
  function Logger(logScroll, logStatus, logScrollSelector) {
    this.logScroll = logScroll;
    this.logStatus = logStatus;
    this.logScrollSelector = logScrollSelector;
  }
 
  Logger.prototype.log = function (text) {
    this.logScroll.list.push(text);
    this.logStatus.progressText = text;
  };
 
  Logger.prototype.clear = function () {
    this.logScroll.list = [];
    this.logStatus.progressText = '';
  };
 
  mw.loader.using('ext.gadget.Vue').then(
    function () {
      init();
    },
    function () {
      console.log('Vue module failed to load');
    }
  );
 
  function init() {
    var wikiaProgress = {};
    wikiaProgress.desc = new Vue({
      el: '#wikia-updater .desc',
      data: {
        style: {
          display: 'block'
        }
      }
    });
    wikiaProgress.log = new Vue({
      el: '#wikia-updater .updater-log-container',
      data: {
        list: ['等待指令……'],
        style: {
          display: 'none'
        }
      },
      watch: {
        list: function () {
          this.$nextTick(function () {
            var $scroll = $('#wikia-updater .scroll-content');
            $scroll.prop('scrollTop', $scroll.prop('scrollHeight'));
          });
        }
      }
    });
    wikiaProgress.label = new Vue({
      el: '#wikia-updater .updater-progress-bar-label',
      data: {
        progressText: '等待指令……'
      }
    });
    wikiaProgress.progress = new Vue({
      el: '#wikia-updater .progress-bar',
      data: {
        style: {
          width: '0'
        },
        widthNum: 0
      },
      watch: {
        widthNum: function (val) {
          if (val > 100) {
            this.style.width = '100%';
          } else if (val < 0) {
            this.style.width = '0';
          } else {
            this.style.width = val + '%';
          }
        }
      }
    });
    wikiaProgress.control = new Vue({
      el: '#wikia-updater .updater-control',
      data: {
        cssClass: {
          disable: false
        },
        logger: new Logger(
          wikiaProgress.log,
          wikiaProgress.label,
          '#wikia-updater .scrollbar-rail'
        )
      },
      methods: {
        update: function () {
          if (!this.cssClass.disable) {
            wikiaProgress.desc.style.display = 'none';
            wikiaProgress.log.style.display = 'block';
            updateWikiaData(
              wikiaProgress.label,
              wikiaProgress.progress,
              wikiaProgress.control,
              this.logger
            );
          }
        }
      }
    });
    var droptableProgress = {};
    droptableProgress.desc = new Vue({
      el: '#droptable-updater .desc',
      data: {
        style: {
          display: 'block'
        }
      }
    });
    droptableProgress.log = new Vue({
      el: '#droptable-updater .updater-log-container',
      data: {
        list: ['等待指令……'],
        style: {
          display: 'none'
        }
      },
      watch: {
        list: function () {
          this.$nextTick(function () {
            var $scroll = $('#droptable-updater .scroll-content');
            $scroll.prop('scrollTop', $scroll.prop('scrollHeight'));
          });
        }
      }
    });
    droptableProgress.label = new Vue({
      el: '#droptable-updater .updater-progress-bar-label',
      data: {
        progressText: '等待指令……'
      }
    });
    droptableProgress.progress = new Vue({
      el: '#droptable-updater .progress-bar',
      data: {
        style: {
          width: '0'
        },
        widthNum: 0
      },
      watch: {
        widthNum: function (val) {
          if (val > 100) {
            this.style.width = '100%';
          } else if (val < 0) {
            this.style.width = '0';
          } else {
            this.style.width = val + '%';
          }
        }
      }
    });
    droptableProgress.control = new Vue({
      el: '#droptable-updater .updater-control',
      data: {
        cssClass: {
          disable: false
        },
        logger: new Logger(
          droptableProgress.log,
          droptableProgress.label,
          '#droptable-updater .scrollbar-rail'
        )
      },
      methods: {
        update: function () {
          if (!this.cssClass.disable) {
            droptableProgress.desc.style.display = 'none';
            droptableProgress.log.style.display = 'block';
            updateDroptableData(
              droptableProgress.label,
              droptableProgress.progress,
              droptableProgress.control,
              this.logger
            );
          }
        }
      }
    });
 
    if (editToken === '+\\') {
      wikiaProgress.label.progressText = '未注册用户无法使用该功能！';
      wikiaProgress.control.cssClass.disable = true;
      droptableProgress.label.progressText = '未注册用户无法使用该功能！';
      droptableProgress.control.cssClass.disable = true;
    }
  }
 
  function updateWikiaData(label, progress, control, logger) {
    logger.clear();
    control.cssClass.disable = true;
    progress.widthNum = 0;
    logger.log('发送请求……');
 
    $.ajax({
      url: wikiaUrl,
      type: 'GET',
      data: {
        action: 'query',
        format: 'json',
        prop: 'revisions',
        titles: wikiaUpdateJobs.join('|'),
        formatversion: '2',
        rvprop: 'timestamp|user|content',
        rvslots: 'main'
      },
      dataType: 'jsonp',
      timeout: 10000,
      cache: false
    })
      .done(function (data) {
        logger.log('已获取数据，开始更新页面……');
        progress.widthNum += 20;
        var keys = Object.keys(data.query.pages);
        var editData = [];
        for (var i = 0; i < keys.length; i++) {
          editData.push({
            title: data.query.pages[keys[i]].title,
            content: data.query.pages[keys[i]].revisions[0]['slots']['main']['content']
          });
        }
        pushUpdateDate(editData, 'Template:RewardTableUpdateDate');
        batchPageEdit(editData, label, progress, control, 80, logger);
      })
      .fail(function (xhr, status) {
        control.cssClass.disable = false;
        logger.log('发送请求过程中出现异常：' + status);
      });
  }
 
  function updateDroptableData(label, progress, control, logger) {
    logger.clear();
    control.cssClass.disable = true;
    progress.widthNum = 0;
    logger.log('获取掉落数据……');
 
    fetch(corsProxy + droptableUrl, {
      method: 'get',
      mode: 'cors'
    })
      .then(function (res) {
        if (!res.ok) {
          throw res;
        }
        return res.text();
      })
      .then(
        function (data) {
          logger.log('已获取数据，开始解析……');
          progress.widthNum += 10;
          droptableJobs(data, label, progress, control, logger);
        },
        function (err) {
          if (err instanceof Error) {
            logger.log('发送请求过程中出现异常：' + err.message);
          } else {
            logger.log('发送请求过程中出现异常：' + err.status);
          }
          console.log(err);
          control.cssClass.disable = false;
        }
      );
  }
 
  function droptableJobs(data, label, progress, control, logger) {
    logger.log('开始解析数据……');
    var subJob, rowsData;
    var droptableData = [];
    var $droptable = $(data);
    for (var i = 0; i < droptableUpdateJobs.length; i++) {
      rowsData = [];
      for (var ii = 0; ii < droptableUpdateJobs[i].subJobs.length; ii++) {
        subJob = droptableUpdateJobs[i].subJobs[ii];
        subJob.builder($droptable.filter('#' + subJob.key).next(), rowsData);
      }
      droptableData.push({
        title: droptableUpdateJobs[i].title,
        content: JSON.stringify(droptableUpdateJobs[i].builder(rowsData))
      });
    }
    pushUpdateDate(droptableData, 'Template:DropTableUpdateDate');
    logger.log('解析完成……');
    progress.widthNum += 10;
    batchPageEdit(droptableData, label, progress, control, 80, logger);
  }
 
  function pushUpdateDate(jobList, pageTitle) {
    jobList.push({
      title: pageTitle,
      content:
        '{{subst:CURRENTYEAR}}年{{subst:CURRENTMONTH1}}月{{subst:CURRENTDAY}}日'
    });
  }
 
  function missionRewardsBuilder($originTable, rowsData) {
    var rotation = 'All';
    var planet, node, mtype, reward, chance, $thRow, matched;
    $originTable.find('tr').each(function () {
      $thRow = $(this).children('th');
      if ($thRow.prop('colspan') === 2) {
        matched = $thRow.text().match(missionRegex);
        if (matched !== null) {
          planet = matched[1];
          mtype = matched[3];
          if (matched[4] === '') {
            node = matched[2];
          } else {
            node = matched[2] + ' ' + matched[4];
          }
        } else {
          matched = $thRow.text().match(rotationRegex);
          if (matched !== null) {
            rotation = matched[1];
          }
        }
      } else if ($(this).hasClass('blank-row')) {
        rotation = 'All';
      } else {
        $(this)
          .children('td')
          .each(function (index) {
            switch (index) {
              case 0:
                reward = $(this).text();
                break;
              case 1:
                chance = $(this).text();
                rowsData.push([planet, node, mtype, rotation, reward, chance]);
                break;
              default:
                break;
            }
          });
      }
    });
  }
 
  function cetusRewardsBuilder($originTable, rowsData) {
    var planet = 'Earth';
    var mtype = 'Bounty';
    var rotation, node, reward, chance, stage, $thRow, matched;
    $originTable.find('tr').each(function () {
      $thRow = $(this).children('th');
      if ($thRow.prop('colspan') === 3) {
        matched = $thRow.text().match(bountyTierRegex);
        if (matched !== null) {
          node = matched[0];
        } else {
          matched = $thRow.text().match(rotationRegex);
          if (matched !== null) {
            rotation = matched[1];
          }
        }
      } else if ($thRow.prop('colspan') === 2) {
        stage = $thRow.text();
      } else {
        $(this)
          .children('td')
          .each(function (index) {
            switch (index) {
              case 1:
                reward = $(this).text();
                break;
              case 2:
                chance = $(this).text();
                rowsData.push([
                  planet,
                  node + '<' + stage + '>',
                  mtype,
                  rotation,
                  reward,
                  chance
                ]);
                break;
              default:
                break;
            }
          });
      }
    });
  }
 
  function deimosRewardsBuilder($originTable, rowsData) {
    solarisRewardsBuilder($originTable, rowsData, 'Deimos');
  }
 
  function solarisRewardsBuilder($originTable, rowsData, nPlanet) {
    var planet;
    if (nPlanet !== undefined) {
      planet = nPlanet;
    } else {
      planet = 'Venus';
    }
    var mtype = 'Bounty';
    var rotation, node, reward, chance, stage, $thRow, matched;
    $originTable.find('tr').each(function () {
      $thRow = $(this).children('th');
      if ($thRow.prop('colspan') === 3) {
        matched = $thRow.text().match(bountyTierRegex);
        if (matched !== null) {
          node = matched[0];
        } else {
          matched = $thRow.text().match(rotationRegex);
          if (matched !== null) {
            rotation = matched[1];
          } else {
            matched = $thRow.text().match(bountyCompletionRegex);
            if (matched !== null) {
              switch (matched[1]) {
                case 'First':
                  rotation = 'A';
                  break;
                case 'Subsequent':
                  rotation = 'B';
                  break;
                case 'Bounty':
                  rotation = 'All';
                  break;
                default:
                  break;
              }
            }
          }
        }
      } else if ($thRow.prop('colspan') === 2) {
        stage = $thRow.text();
      } else {
        $(this)
          .children('td')
          .each(function (index) {
            switch (index) {
              case 1:
                reward = $(this).text();
                break;
              case 2:
                chance = $(this).text();
                rowsData.push([
                  planet,
                  node + '<' + stage + '>',
                  mtype,
                  rotation,
                  reward,
                  chance
                ]);
                break;
              default:
                break;
            }
          });
      }
    });
  }
 
  function sortieRewardsBuilder($originTable, rowsData) {
    var planet = 'Any';
    var mtype = 'Any';
    var rotation = 'All';
    var node = 'Sortie';
    var reward, chance;
 
    $originTable.find('tr').each(function () {
      $(this)
        .children('td')
        .each(function (index) {
          switch (index) {
            case 0:
              reward = $(this).text();
              break;
            case 1:
              chance = $(this).text();
              rowsData.push([planet, node, mtype, rotation, reward, chance]);
              break;
            default:
              break;
          }
        });
    });
  }
 
  function transientRewardsBuilder($originTable, rowsData) {
    var dupFilter = {};
    var rotation = 'All';
    var planet, node, mtype, reward, chance, $thRow, matched;
    $originTable.find('tr').each(function () {
      $thRow = $(this).children('th');
      if ($thRow.prop('colspan') === 2) {
        node = $thRow.text();
        if (dupFilter[node] === true) {
          return;
        }
        dupFilter[node] = true;
        mtype =
          typeof distinctNodeMtypeMap[node] !== 'undefined'
            ? distinctNodeMtypeMap[node]
            : 'Any';
        planet =
          typeof distinctNodePlanetMap[node] !== 'undefined'
            ? distinctNodePlanetMap[node]
            : 'Any';
      } else if ($(this).hasClass('blank-row')) {
        rotation = 'All';
      } else {
        matched = $thRow.text().match(rotationRegex);
        if (matched !== null) {
          rotation = matched[1];
        } else {
          $(this)
            .children('td')
            .each(function (index) {
              switch (index) {
                case 0:
                  reward = $(this).text();
                  break;
                case 1:
                  chance = $(this).text();
                  rowsData.push([
                    planet,
                    node,
                    mtype,
                    rotation,
                    reward,
                    chance
                  ]);
                  break;
                default:
                  break;
              }
            });
        }
      }
    });
  }
 
  function keyRewardsBuilder($originTable, rowsData) {
    var dupFilter = {
      'Orokin Derelict Assassinate': true,
      'Orokin Derelict Defense': true,
      'Orokin Derelict Survival': true
    };
    var rotation = 'All';
    var skipTable = false;
    var planet, node, mtype, reward, chance, $thRow, matched, isTableBound;
    $originTable.find('tr').each(function () {
      isTableBound = $(this).hasClass('blank-row');
      if (!isTableBound && skipTable) {
        return;
      } else if (isTableBound) {
        skipTable = false;
      }
      $thRow = $(this).children('th');
      if ($thRow.prop('colspan') === 2) {
        matched = $thRow.text().match(rotationRegex);
        if (matched !== null) {
          rotation = matched[1];
        } else {
          node = $thRow.text();
          if (dupFilter[node] === true) {
            skipTable = true;
            return;
          }
          dupFilter[node] = true;
          mtype =
            typeof distinctNodeMtypeMap[node] !== 'undefined'
              ? distinctNodeMtypeMap[node]
              : 'Any';
          planet =
            typeof distinctNodePlanetMap[node] !== 'undefined'
              ? distinctNodePlanetMap[node]
              : 'Any';
        }
      } else if (isTableBound) {
        rotation = 'All';
      } else {
        $(this)
          .children('td')
          .each(function (index) {
            switch (index) {
              case 0:
                reward = $(this).text();
                break;
              case 1:
                chance = $(this).text();
                rowsData.push([planet, node, mtype, rotation, reward, chance]);
                break;
              default:
                break;
            }
          });
      }
    });
  }
 
  function missionDropBuilder(rowsData) {
    var missionDropTemplate = {
      license: 'CC0-1.0',
      description: {
        en:
          'This table is generated by scripts. Manual edit is not recommended.'
      },
      sources: droptableUrl,
      schema: {
        fields: [
          {
            name: 'planet',
            type: 'string',
            title: {
              en: 'planet'
            }
          },
          {
            name: 'node',
            type: 'string',
            title: {
              en: 'node'
            }
          },
          {
            name: 'mtype',
            type: 'string',
            title: {
              en: 'mtype'
            }
          },
          {
            name: 'rotation',
            type: 'string',
            title: {
              en: 'rotation'
            }
          },
          {
            name: 'reward',
            type: 'string',
            title: {
              en: 'reward'
            }
          },
          {
            name: 'chance',
            type: 'string',
            title: {
              en: 'chance'
            }
          }
        ]
      },
      data: []
    };
    missionDropTemplate.data = rowsData;
    return missionDropTemplate;
  }
 
  function enemyDropTablesBuilder($originTable, rowsData) {
    rowsData.headers = [
      'enemyName',
      'drop',
      'itemName',
      'itemDropChance',
      'itemChance'
    ];
    rowsData.dropMaxCount = 0;
    var enemyName, itemName, itemDropChance, itemChance, row;
    $originTable.find('tr').each(function () {
      $(this)
        .children('th')
        .each(function () {
          if ($(this).prop('colspan') === 2) {
            itemDropChance = (
              $(this)
                .text()
                .match(chanceRegex)[1] / 100
            ).toFixed(2);
          } else {
            enemyName = $(this).text();
            row = [enemyName];
            row.dropCount = 0;
          }
        });
      $(this)
        .children('td')
        .each(function (index) {
          switch (index) {
            case 0:
              if ($(this).hasClass('blank-row')) {
                rowsData.push(row);
              }
              break;
            case 1:
              itemName = $(this).text();
              break;
            case 2:
              itemChance = (
                $(this)
                  .text()
                  .match(chanceRegex)[1] / 100
              ).toFixed(2);
              row.push(itemName, '' + itemDropChance, '' + itemChance);
              row.dropCount++;
              if (rowsData.dropMaxCount < row.dropCount) {
                rowsData.dropMaxCount = row.dropCount;
              }
              break;
            default:
              break;
          }
        });
    });
    for (var i = 0; i < rowsData.length; i++) {
      for (
        var ii = rowsData[i].length, maxCol = rowsData.dropMaxCount * 3 + 1;
        ii < maxCol;
        ii++
      ) {
        rowsData[i].push(null);
      }
    }
  }
 
  function rewardDropTablesBuilder($originTable, rowsData) {
    rowsData.headers = [
      'modName',
      'from',
      'enemyName',
      'modDropChance',
      'modChance'
    ];
    rowsData.dropMaxCount = 0;
    var skipTable = false;
    var skipModRegex = /\d\d Endo/;
    var enemyName, modName, modDropChance, modChance, $thRow, row, isTableBound;
    $originTable.find('tr').each(function () {
      isTableBound = $(this).hasClass('blank-row');
      if (!isTableBound && skipTable) {
        return;
      } else if (isTableBound) {
        skipTable = false;
      }
      $thRow = $(this).children('th');
      if ($thRow.prop('colspan') === 3) {
        modName = $thRow.text();
        if (skipModRegex.test(modName)) {
          skipTable = true;
          return;
        }
        row = [modName];
        row.dropCount = 0;
      }
      $(this)
        .children('td')
        .each(function (index) {
          switch (index) {
            case 0:
              if ($(this).hasClass('blank-row')) {
                rowsData.push(row);
              } else {
                enemyName = $(this).text();
              }
              break;
            case 1:
              modDropChance = (
                $(this)
                  .text()
                  .match(chanceRegex)[1] / 100
              ).toFixed(2);
              break;
            case 2:
              modChance = (
                $(this)
                  .text()
                  .match(chanceRegex)[1] / 100
              ).toFixed(2);
              row.push(enemyName, '' + modDropChance, '' + modChance);
              row.dropCount++;
              if (rowsData.dropMaxCount < row.dropCount) {
                rowsData.dropMaxCount = row.dropCount;
              }
              break;
            default:
              break;
          }
        });
    });
    for (
      var i = 0, maxCol = rowsData.dropMaxCount * 3 + 1;
      i < rowsData.length;
      i++
    ) {
      for (var ii = rowsData[i].length; ii < maxCol; ii++) {
        rowsData[i].push(null);
      }
    }
  }
 
  function itemDropBuilder(rowsData) {
    var itemDropTemplate = {
      license: 'CC0-1.0',
      description: {
        en:
          'This table is generated by scripts. Manual edit is not recommended.'
      },
      sources: droptableUrl,
      schema: {
        fields: []
      },
      data: []
    };
    itemDropTemplate.schema.fields.push(fieldBuilder(rowsData.headers[0]));
    for (var i = 0; i < rowsData.dropMaxCount; i++) {
      itemDropTemplate.schema.fields.push(
        fieldBuilder(rowsData.headers[1] + '[' + i + '].' + rowsData.headers[2])
      );
      itemDropTemplate.schema.fields.push(
        fieldBuilder(rowsData.headers[1] + '[' + i + '].' + rowsData.headers[3])
      );
      itemDropTemplate.schema.fields.push(
        fieldBuilder(rowsData.headers[1] + '[' + i + '].' + rowsData.headers[4])
      );
    }
    itemDropTemplate.data = rowsData;
    return itemDropTemplate;
  }
 
  function fieldBuilder(name) {
    var strippedName = name.replace(/[[\].]/g, '');
    var field = {
      name: strippedName,
      type: 'string',
      title: {
        en: name
      }
    };
    return field;
  }
 
  /* data = [ {title: '...', content: '...'}, ... ] */
  function batchPageEdit(data, label, progress, control, step, logger) {
    var lastPromise = $.when();
    var segment = step / data.length;
    $.each(data, function (index, value) {
      lastPromise = lastPromise.then(function () {
        logger.log('开始更新' + value.title + '……');
        return getPageEditPromise(
          value.title,
          value.content,
          label,
          progress,
          segment,
          logger
        );
      });
    });
    lastPromise.then(
      function () {
        logger.log('数据更新成功！');
        control.cssClass.disable = false;
      },
      function () {
        logger.log('数据更新失败！');
        control.cssClass.disable = false;
      }
    );
  }
 
  function getPageEditPromise(
    pageTitle,
    pageContent,
    label,
    progress,
    step,
    logger
  ) {
    return $.ajax({
      url: '/api.php',
      data: {
        format: 'json',
        action: 'edit',
        title: pageTitle,
        summary: '通过脚本自动更新数据',
        text: pageContent,
        token: editToken
      },
      timeout: 30000,
      dataType: 'json',
      type: 'POST'
    })
      .done(function () {
        logger.log(pageTitle + '已更新！');
        progress.widthNum += step;
      })
      .fail(function (xhr, status) {
        logger.log('写入' + pageTitle + '时出现异常：' + status);
      });
  }
})(mediaWiki, jQuery);
//</nowiki>