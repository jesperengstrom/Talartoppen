// MP = Member of Parliament

/**
 * MODEL module - handles app logic & data
 */
const MODEL = (function() {
    //arr where lists of mp:s are stored
    var allMPs = [];
    var filteredMPs = [];
    //counts fetches for the progress bar
    var loaded = 0;
    //stores from when the last search was made
    var searchDate;
    var sortOrder = 'desc';

    /**
     * Returns all MPs
     * Originally fetched from: https://data.riksdagen.se/personlista/?iid=&fnamn=&enamn=&f_ar=&kn=&parti=&valkrets=&rdlstatus=&org=&utformat=json&termlista=
     * Currently fetched locally since it's very big and doesn't change very often.
     */
    function fetchAllMPs() {
        return fetch('json/rawMPs.json')
            .then(handleFetchErrors)
            .then(response => response.json())
            .then(data => slimArray(data))
            .catch(error => console.log(error));
    }

    function handleFetchErrors(response) {
        if (!response.ok) {
            throw Error(response.statusText);
        }
        return response;
    }

    /**
     * Returns a slimmer array of MP:s with the props i need
     * * @param {array} mps - original raw array of MP:s
     */
    function slimArray(mps) {
        let mp = mps.personlista.person;
        for (let i in mp) {
            allMPs.push({
                id: mp[i].intressent_id,
                firstname: mp[i].tilltalsnamn,
                lastname: mp[i].efternamn,
                party: mp[i].parti,
                gender: mp[i].kon,
                born: mp[i].fodd_ar,
                electorate: mp[i].valkrets,
                image: httpsIfy(mp[i].bild_url_192)
            });
        }
        fetchDebates(allMPs);
    }

    //changes http to https to avoid browser blocking requests
    function httpsIfy(url) {
        return "https" + url.substring(4, url.length);
    }

    /**
     * Monster function that fetches speeches for all mp:s in a loop.
     * * @param {array} mps - the new slimmer array of mps:s
     */
    function fetchDebates(mps) {
        var fetchObj;
        //If I want to search one month back.
        //let fromDate = MODEL.oneMonthBack();
        //If I want the whole Riksmöte 16/17
        let fromDate = "";
        let countComebacks = 'Ja';

        for (let i in mps) {
            fetchObj = fetch(`https://data.riksdagen.se/anforandelista/?rm=2016%2F17&anftyp=${countComebacks}&d=${fromDate}&ts=&parti=&iid=${mps[i].id}&sz=200&utformat=json`)
                .then(handleFetchErrors)
                .then(response => response.json())
                .then(data => addSpeechToArray(data, i))
                .catch(error => console.log(error));
        }
        // Fetch is done, we're ready to store array and send to print
        fetchObj.then(() => {
            CONTROLLER.storeArray(allMPs, 'all', fromDate);
            searchDate = fromDate;
        });
    }

    // function herokuServer() {
    //     var fetchObj;
    //     let fromDate = "";
    //     fetchObj = fetch(`https://riksy.herokuapp.com/all`)
    //         .then(handleFetchErrors)
    //         .then(response => {
    //             increaseProgressbar();
    //             return response.json();
    //         })
    //         .catch(error => console.log(error));

    //     fetchObj.then((data) => {
    //         let readyArr = formatHerokuArr(data);
    //         CONTROLLER.storeArray(readyArr, 'all');
    //         searchDate = fromDate;
    //     });

    // }

    // function formatHerokuArr(arr) {
    //     let formatArr = arr.map(function(obj) {
    //         let newObj = obj;
    //         newObj.numberofspeeches = parseInt(obj.numberOfSpeeches);
    //         delete newObj.numberOfSpeeches;
    //         return newObj;
    //     });
    //     return formatArr;
    // }

    /**
     * pushes speeches to mp-array using the index
     ** @param {promise} data - the promise recently fetched
     ** @param {string} i - current index
     */
    function addSpeechToArray(data, i) {
        allMPs[i].numberofspeeches = parseInt(data.anforandelista['@antal']);
        if (data.anforandelista['@antal'] !== '0') {
            //in case of only one speech, have to make it an array manually
            if (allMPs[i].numberofspeeches === 1) {
                allMPs[i].speeches = [];
                allMPs[i].speeches.push(data.anforandelista.anforande);
            } else allMPs[i].speeches = data.anforandelista.anforande;
            console.log('getting speeches');
            loaded += 1;
            increaseProgressbar();
        }
    }

    /**
     * Takes number of fetched speeches and converts to % for the
     * progress-bar on page. Should really be done in VIEW...
     */
    function increaseProgressbar() {
        let percent = Math.round((loaded / 349) * 100);
        // let percent = 100;
        let progress = document.querySelector(".progress-bar");
        progress.innerHTML = percent + "%";
        progress.style.width = percent + "%";
        progress.setAttribute("aria-valuenow", percent);
    }

    /**
     * Sorts the values of a certain prop in an array of objects. To sort toplist + chart.
     * * @param {array} arr - array to be sorted
     * * @param {string} prop - property to sort
     */
    function sortNumberOfSpeeches(arr, prop) {
        let filtered = arr.filter((val) => {

            //Ajax async sometimes cause undefined values to turn up on the toplist. As for now i am simply removing that mp + logging it.
            //Better than to set their speech rate to 0 as that effects the party stats negatively.
            if (isNaN(val[prop])) console.log("filter removed an undefined", val);
            return (!isNaN(val[prop]));
        });
        if (sortOrder === 'desc') return filtered.sort((a, b) => a[prop] > b[prop] ? -1 : 1);
        if (sortOrder === 'asc') return filtered.sort((a, b) => a[prop] < b[prop] ? -1 : 1);
        else console.log("error!!")
    }

    /**
     * calcs the total number of speeches an array and returns the number.
     * Used by the charts.
     */
    function totalSpeeches(mps) {
        //for safety, filters out any "undefined" values from the array to avoid a NaN total.
        return mps.filter((val) => {
            return (!isNaN(val.numberofspeeches));

        }).reduce((total, cur) => {
            return total + cur.numberofspeeches;
        }, 0);
    }

    /**
     * Before I can print the chart, I need to format data in a way that Chartist.js accepts.
     * * @param {array} indata - the chart data to be formatted
     */
    function formatChartObj(indata) {
        // template object
        var data = {
            labels: [],
            series: [
                []
            ]
        };
        // since Chartist don't support setting bar colors via the API, Im adding a meta tag and append
        // the corresponding class to the SVG element later on draw... phew
        indata.forEach((element) => {
            data.labels.push(element.label);
            data.series[0].push({ value: element.quota, className: 'bar-' + element.label });
        }, this);
        return data;
    }

    return {

        /**
         * Retrieves the array of MP:s from the model.
         *  * @param {string} which - Either all or a current selection
         */
        getArray: function(which) {
            // let sorted = sortNumberOfSpeeches(mps, 'numberofspeeches');
            return which === 'all' ? sortNumberOfSpeeches(allMPs, 'numberofspeeches') : sortNumberOfSpeeches(filteredMPs, 'numberofspeeches');
        },

        /**
         * Sorts and stores the array of MPs in the model.
         * * @param {array} mps - array of mp:s to store.
         * * @param {string} which - store all or current selection
         */
        setArray: function(mps, which) {
            return which === 'all' ? allMPs = mps : filteredMPs = mps;
        },

        setSortOrder: function(order) {
            sortOrder = order;
        },

        getSearchDate: function() {
            return searchDate;
        },

        initMPObject: function() {
            //old setup
            fetchAllMPs();
            // herokuServer();
        },

        /**
         * Reverts the current date one month. NEEDS REMAKE (DEC BECOMES -1 INST OF 12)
         */
        oneMonthBack: function() {
            let date = new Date();
            return date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        },

        /**
         * Filters AllMPs on basis of another array of selections by user.
         * Array.Some is helpful here since it looks for any occurance in the other array.
         * * @param {array} lookingfor - array of strings
         * * @param {string} prop - the property that i want to target
         */
        filterMPs: function(lookingfor, prop) {
            let all = MODEL.getArray('all');
            let filtered = all.filter((mp) => {
                return lookingfor.some((thing) => {
                    return thing === mp[prop];
                });
            });
            return filtered;
        },

        /**
         * Returns an array of objects with the total number of speeches by a certain category,
         * the number of members in that category and (sorted by) the quota of the two.
         * For charts.
         * * @param {string} prop - I want to sum the values in this property
         */
        sumSpeechesBy: function(prop) {
            let temp = [];
            var categories = [];
            if (prop == 'party') {
                categories = ['S', 'V', 'MP', 'M', 'L', 'C', 'KD', 'SD', '-'];
            }

            if (prop == 'gender') {
                categories = ['man', 'kvinna'];
            }
            // If i need to count all speeches...
            // let all = MODEL.getArray("all");
            // let total = totalSpeeches(all);

            categories.forEach((category) => {
                let numMps = MODEL.filterMPs([category], prop).length;
                let numSpeeches = totalSpeeches(MODEL.filterMPs([category], prop));

                temp.push({
                    label: category,
                    mps: numMps,
                    speeches: numSpeeches,
                    quota: Math.round((numSpeeches / numMps) * 100) / 100
                });
            });
            temp = sortNumberOfSpeeches(temp, 'quota');
            const result = formatChartObj(temp);
            return result;
        },

        /**
         * Gets the XML of individual speeches on request.
         * Since Fetch doesn't handle XML, I'm doing this the oldfashoned way.
         * * @param {object} speechobj - the object containing link to speech text
         * * @param {function} callback - for returning the result to the caller function. 
         */
        getSpeech: function(speechobj, callback) {
            let url = httpsIfy(speechobj.anforande_url_xml);
            var req = new XMLHttpRequest();

            req.onreadystatechange = function() {
                if (this.readyState == 4 && this.status == 200) {
                    let doc = req.responseXML;
                    let speech = doc.getElementsByTagName("anforandetext")[0].childNodes[0].nodeValue;
                    callback(speech);
                }
            };
            req.open("GET", url, true);
            req.send();
            req.addEventListener("error", () => console.log("Fel när anförandet skulle hämtas", req.statusText));
        }
    };
})();

/**
 * CONTROLLER module - directs communication
 */
const CONTROLLER = (function() {
    /**
     * gets the right (type) of array and then sends it to print.
     * Hides all other sections. Cause it's kind of a hub, it also console.logs some stuff.
     * * @param {string} type - what to print, all or filtered list
     */
    function prepareToPrintToplist(type) {
        let toPrint = MODEL.getArray(type);
        if (toPrint.length === 0) console.log('control says: Array came back empty from storage');
        else console.log('To print:', toPrint);

        VIEW.hideAllButMe('toplist-section');
        VIEW.printTopList(toPrint);
    }

    return {

        init: function() {
            MODEL.initMPObject();
        },

        /**
         * Stores and sends to print the (right type) array
         * * @param {array} mps - the array of MPs
         * * @param {string} type - in which array to store - "all" or "filtered"
         */
        storeArray: function(mps, type) {
            MODEL.setArray(mps, type);
            prepareToPrintToplist(type);
        },

        /**
         * Gets sent an element that was clicked in the nav bar.
         * Depening on which one, the right function runs and all other sections are hidden.
         */
        navClick: function() {
            document.querySelectorAll(".main-lists").forEach((el) => {
                el.classList.remove("active", "bigger");
            });

            //reset all party filters
            document.querySelectorAll('.partyBtn').forEach((el) => {
                el.classList.remove('active', 'activeParty');
            });

            //Default sort order for every case except Bottenlistan
            MODEL.setSortOrder('desc');

            let clicked = this.firstChild.nodeValue;

            switch (clicked) {
                case "Topplistan":
                    this.parentElement.classList.add("active", "bigger");
                    prepareToPrintToplist('all');
                    break;
                case "Bottenlistan":
                    this.parentElement.classList.add("active", "bigger");
                    MODEL.setSortOrder('asc');
                    prepareToPrintToplist('all');
                    break;
                case "Om":
                    VIEW.hideAllButMe('about-section');
                    break;
                case "Partitoppen":
                    {
                        let votesbyParty = MODEL.sumSpeechesBy('party');
                        // adding a string as caller id. both charts use the same method, but I need to create separate charts.
                        VIEW.printChart(votesbyParty, 'partyChart');
                        VIEW.hideAllButMe('party-chart-section');
                        break;
                    }
                case "Könsfördelning":
                    {
                        let votesByGender = MODEL.sumSpeechesBy('gender');
                        VIEW.printChart(votesByGender, 'genderChart');
                        VIEW.hideAllButMe('gender-chart-section');
                        break;
                    }
                default:
                    prepareToPrintToplist("all");
                    break;
            }
        },

        /**
         * Extracts the strings from the active buttons - i.e the names of parties I want to filter out.
         * These are pushed to an array and then sent to filterMPs - returning the mp-objects that match.
         * Then sent to storage.
         * * @param {nodeList} elems - the list of toggle buttons for filtering parties.
         */
        getPartySelection: function(elems) {
            let selection = [];
            elems.forEach((element) => {
                if (element.classList.contains('activeParty')) {
                    selection.push(element.firstChild.nodeValue);
                }
            });
            let filtered = MODEL.filterMPs(selection, 'party');
            CONTROLLER.storeArray(filtered, 'filtered');
        },

        /**
         * Triggers a modal window for the MP klicked. 
         * Sudden jQuery-syntax comes from Bootstrap documentation.
         */
        openModal: function(mp) {
            VIEW.printModal.call(mp);
            VIEW.showModalSection("modal-speech-list");
            $('#mpModal').modal();
        },

        /**
         * Passes getSpeech an object and calls back a speech text. Sends it back to view
         * along with the object. 
         */
        openSpeech: function(speechObj) {
            MODEL.getSpeech(speechObj, function(xml) {
                var result = xml;
                VIEW.printSpeech(result, speechObj);
            });

        }
    };
})();


/**
 * VIEW module - Handles everything u see & interact with
 */
const VIEW = (function() {

    /**
     * Had to make this loop to attach event listeners for the toplist. 
     * Tried every possible closure in the 'main' loop but none would stick. Maybe because the template literal was creating the elements
     * at the same time?
     * * @param {array} mps - mp object
     */
    function listenersForToplist(mps) {
        for (let i in mps) {
            document.querySelector(`tr[data-id="${mps[i].id}"]`).
            addEventListener('click', CONTROLLER.openModal.bind(null, mps[i]));
        }
    }

    /**
     * Making speeches clickable
     * @param {array} speeches - array of speeches that is printed in the modal
     */
    function listenersForSpeeches(speeches) {
        for (let i in speeches) {
            document.getElementById(speeches[i].anforande_id).
            addEventListener('click', CONTROLLER.openSpeech.bind(null, speeches[i]));
        }
    }

    /**
     * You often need to remove stuff in the topic descriptions. For ex "svar på interpellation 1235 om..." after the "om" follows
     * the real issue, so i extract everything after the "om", capitalize the first letter and return.
     * @param {string} string - topic of the speech
     */
    function trimString(string) {
        let newString = string;
        let search = newString.indexOf(' om ');
        if (search > 0) {
            let temp = newString.substring(search + 4, newString.length);
            temp = capitalizeFirst(temp);
            newString = temp;
        }
        return newString;
    }

    function capitalizeFirst(str) {
        if (str) {
            str = str[0].toUpperCase() + str.substring(1, str.length);
        }
        return str;
    }

    /**
     * Makes a template literal string of speeches and append it to <ul> in the modal.
     * Then pass these speeches along to make event listerners for them.
     */
    function printSpeechList() {
        let ul = document.getElementById('modal-speech-list'),
            speechArr = [],
            string = '',
            count = 0;
        const sp = this.speeches,
            eMega = '<i class="em em-mega"> </i>',
            eSpeech = '<i class="em em-speech_balloon"> </i>';
        ul.innerHTML = "";

        // no speeches
        if (!sp) return '<i class="em em-disappointed"></i>';
        console.log(sp.length);
        for (let i in sp) {
            // if the previous debate was the same as this one, then skip it...
            // the loose compare is important since it accepts string "0".
            if (i == 0 || sp[i].avsnittsrubrik !== sp[i - 1].avsnittsrubrik) {
                string += `<li> 
                            <span class="${sp[i].replik == 'Y' ? 'comeback' : 'own'}-debate debate-topic" id="${sp[i].anforande_id}">
                            ${trimString(sp[i].avsnittsrubrik)}</span>
                            <span class="debate-context">${capitalizeFirst(sp[i].kammaraktivitet) || '' } ${sp[i].dok_datum}.</span> 
                            `;
                count++;

                // If the next topic will be a new one, close the list item.
                if (i > sp.length - 1 && sp[i].avsnittsrubrik !== sp[i + 1].avsnittsrubrik) string += '</li>';

                // ... instead print out an emoji
            } else string += `<i id="${sp[i].anforande_id}" class="em em-${sp[i].replik == 'Y' ? 'speech_balloon' : 'mega'}"></i>`;

            speechArr.push(sp[i]);
            if (count === 10) break;
        }
        // can's just return the string to parent function because then the event listeners be created before the elements = fail.
        ul.innerHTML = string;
        listenersForSpeeches(speechArr);
    }

    return {

        /**
         * prints the toplist
         * * @param {array} mps - mps to print (the 10 first)
         */
        printTopList: function(mps) {

            // make a new arr of the items actually printed so I can add event listeners for them
            const toplistArr = [];
            const max = 10;

            //print search date in nav bar/hero (depending on screen size)
            let datelines = Array.from(document.querySelectorAll(".lead-smaller"));
            datelines.forEach((elem) => elem.innerHTML = `* ${MODEL.getSearchDate() || "Under riksmötet 2016/17"}`);

            //I found no way to split a table in sections, so I had to make two
            let toplist = document.getElementById("toplist");
            const toplistRight = document.getElementById("toplist2");

            //div for nothing-to-print
            let none = document.getElementById("none");

            toplist.innerHTML = "";
            toplistRight.innerHTML = "";
            none.innerHTML = "";

            if (mps.length === 0) {
                none.innerHTML = "<p>Oops, det finns ingen data att visa.</p>";
                return;
            }
            // keep printing the toplist until you reach the end of arr OR max value.
            for (let i = 0; i < max && i < mps.length; i++) {

                //append place 5-10 to the second table
                if (i >= 5) {
                    toplist = toplistRight;
                }
                toplist.innerHTML += `
                <tr data-id="${mps[i].id}" class="bg-${mps[i].party}">
                    <th scope="row">${i + 1}</th>
                    <td class="td-img">
                        <div class="mp-img-container border-${mps[i].party}">
                            <img src="${mps[i].image}" class="mp-img" alt="${mps[i].firstname} ${mps[i].lastname}">
                        </div>
                    </td>
                    <td>${mps[i].firstname} ${mps[i].lastname} (${mps[i].party})</td>
                    <td class="td-right">${mps[i].numberofspeeches}</td>
                </tr>
                `;
                toplistArr.push(mps[i]);
            }
            listenersForToplist(toplistArr);
        },

        /**
         * Chart itself is made in chart_animation.js
         * * @param {object} data - data to be displayed in the chart
         * * @param {string} which - are we creating gender/party chart?
         */
        printChart: function(data, which) {
            console.log("print chart:", data);

            if (which === 'partyChart') {
                CHART.makePartyChart(data);

                //text for the box beside the chart
                let last = data.labels[data.labels.length - 1];
                if (last == "-") last = "de oberoende";

                let conclusion = document.getElementById("party-chart-conclusion");
                conclusion.innerHTML = `<mark>Under perioden var ${data.labels[0]}:s ledamöter mest på hugget (talade ${data.series[0][0].value} gånger) 
                                        medan ${last} var sämst på att ta till orda (${data.series[0][data.series[0].length -1].value} gånger).</mark>`;
            }
            if (which === 'genderChart') {
                CHART.makeGenderChart(data);

                let percent = Math.round((((data.series[0][0].value) - (data.series[0][1].value)) / data.series[0][1].value) * 100);
                let conclusion = document.getElementById("gender-chart-conclusion");
                conclusion.innerHTML =
                    `Under perioden talade en ${data.labels[0]} i Riksdagen ${percent}% oftare (${data.series[0][0].value} gånger) än en ${data.labels[1]} (${data.series[0][1].value} gånger).`;
            }
        },

        /**
         * Prints the modal head.
         */
        printModal: function() {
            //Heading with pic & name
            let modalHeading = `${this.firstname} ${this.lastname} (${this.party}) `;
            let modalPic = `<div class="mp-img-container-modal">
                            <img src="${this.image}" class="mp-img" alt="${this.firstname} ${this.lastname}"></div>`;

            let hasSpeeches = this.speeches ?
                `<br>Nedan visas de senaste tillfällena. Klicka för att läsa vad ${this.gender == 'man' ? 'han' : 'hon'} sade.</p>` :
                '<br>Därför finns det inget att visa här.</p>';

            //Some info bout the mp
            let modalFacts = `
                <p><strong>Född:</strong> ${this.born}. <strong>Valkrets:</strong> ${this.electorate}.</p>
                <p>${this.firstname} har debatterat i Riksdagen ${this.numberofspeeches} gånger sedan ${MODEL.getSearchDate() || "riksmötet 2016/17 öppnade"}. 
                ${hasSpeeches}
                `;

            document.getElementById("mpModalLabel").innerHTML = modalHeading;
            document.getElementById("modal-pic").innerHTML = modalPic;
            document.getElementById("modal-facts").innerHTML = modalFacts;

            //... Print the speech list as last thing.
            printSpeechList.call(this);
        },

        /**
         * Renders the actual speech text when you clicked a list item
         * @param {string} speech - an html string of the speech
         * @param {string} obj - speech meta obj
         */
        printSpeech: function(speech, obj) {
            //hide the list
            VIEW.showModalSection("modal-speech-text");

            let speechElem = document.getElementById("modal-speech-text");
            //setting the speeches date
            speechElem.querySelector(".debate-context").innerHTML = obj.dok_datum;
            //speeches header
            speechElem.querySelector(".speech-header").innerHTML = obj.avsnittsrubrik;
            //body
            speechElem.querySelector("#speech-body").innerHTML = speech;
            //footer
            speechElem.querySelector("#speech-footer").innerHTML = `
            <mark><a target="_blank" href="${obj.protokoll_url_www}">Läs hela debatten här</a></mark>`;
            //button
            speechElem.querySelector("button").addEventListener("click", () => VIEW.showModalSection("modal-speech-list"));
        },

        //toggles the modal sections visibility
        showModalSection: function(section) {
            document.getElementById("modal-speech-list").className = "hidden";
            document.getElementById("modal-speech-text").className = "hidden";

            document.getElementById(section).className = "visible";
        },

        /**
         * Hide all the main sections, then show 
         ** @param {string} me
         */
        hideAllButMe: function(me) {
            let sections = ["loading-section", "toplist-section", "gender-chart-section", "party-chart-section", "about-section"];
            sections.forEach((element) => {
                document.getElementById(element).className = "hidden";
            });

            document.getElementById(me).className = 'visible';
        },

        /**
         * EVENT LISTENERS FOR NON-DYNAMIC ELEMENTS
         * 1) first call picks upp mp-array and makes 300 ajax calls and creates
         * a live object.
         * 2) second call is a dev bypass that cuts directly to sorting using
         * a readymade array of objects.
         */
        init: (function() {
            // 1)
            document.addEventListener("DOMContentLoaded", CONTROLLER.init);
            // 2
            // document.addEventListener('DOMContentLoaded', function() {
            //     VIEW.hideAllButMe('toplist-section');
            //     CONTROLLER.storeArray(testMPs, 'all');
            // });

            /**
             * event listeners for my menu items, since nothing on the page is a hyperlink, just JS.
             * Sends all of the nav-element to a controller function which then decides which one was clicked via 'this'.
             * 
             * Some browers support forEach with NodeLists, but some (Edge) do not. That's why the're converted to proper arrays first.
             */
            Array.from(document.querySelectorAll('.launch-nav-event')).forEach(function(element) {
                element.addEventListener('click', CONTROLLER.navClick);
            }, this);

            /**
             * Same concept with my listeners for party filtering, except I toggle a class and lets the controller function check
             * which ones are 'active', ie selected.
             */
            const partyBtns = Array.from(document.querySelectorAll('.partyBtn'));

            partyBtns.forEach(function(element) {
                element.addEventListener('click', function() {
                    this.classList.toggle('activeParty');
                    CONTROLLER.getPartySelection(partyBtns);
                });
            }, this);
        })()
    };
})();