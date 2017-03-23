const MODEL = (function() {
    var allMPs = [];
    var filteredMPs = [];

    /**
     * Returns a promise of all MP:s. NEEDS REJECT OPTION
     * Originally fetched from: http://data.riksdagen.se/personlista/?iid=&fnamn=&enamn=&f_ar=&kn=&parti=&valkrets=&rdlstatus=&org=&utformat=json&termlista=
     * But now fetched locally since it's very big and doesn't change very often.
     */
    function fetchAllMPs() {
        return fetch("json/rawMPs.json")
            .then(response => response.json())
            .then(data => slimArray(data));
    }

    /**
     * Returns a slimmer array of MP:s with the props i need
     * @param {array} mps - original raw array of MP:s
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
                image: mp[i].bild_url_192
            });
        }
        fetchDebates(allMPs);
    }

    function fetchDebates(mps) {
        var fetchObj;
        let fromDate = MODEL.oneMonthBack();
        let countComebacks = "Ja";

        for (let i in mps) {
            fetchObj = fetch(`http://data.riksdagen.se/anforandelista/?rm=2016%2F17&anftyp=${countComebacks}&d=${fromDate}&ts=&parti=&iid=${mps[i].id}&sz=200&utformat=json`)
                .then(response => response.json())
                .then(data => addSpeech(data, i));
        }
        fetchObj.then(function() {
            CONTROLLER.storeArray(allMPs, "all");
            VIEW.toggleLoadScreen();
        });

    }

    function addSpeech(data, i) {
        allMPs[i].numberofspeeches = parseInt(data.anforandelista["@antal"]);
        if (data.anforandelista["@antal"] !== "0") {
            allMPs[i].speeches = data.anforandelista.anforande;
        }
    }

    /**
     * SORTS: MAKES THE TOP LIST
     * @param {array} mps - mp array of objects
     */
    function sortNumberOfSpeeches(mps) {
        return mps.sort((a, b) => a.numberofspeeches > b.numberofspeeches ? -1 : 1);
    }

    return {
        /**
         * Retrieves the array of MP:s from the model. Either all or a current selection depending on request.
         */
        getArray: function(which) {
            return which === "all" ? allMPs : filteredMPs;
        },

        /**
         * Sorts the array of MP:s by no of speeches before storing it in the model.
         * Either all or a current selection depending on request.
         */
        setArray: function(mps, which) {
            let sorted = sortNumberOfSpeeches(mps);
            return which === "all" ? allMPs = sorted : filteredMPs = sorted;
        },

        initMPObject: function() {
            fetchAllMPs();
        },
        /**
         * REVERTS CURRENT DATE ONE MONTH. NEEDS REMAKE (DEC BECOMES -1 INST OF 12)
         */
        oneMonthBack: function() {
            let date = new Date();
            return date.getFullYear() + "-" + date.getMonth() + "-" + date.getDate();
        },

        /**
         * I have to filter out my huge array on the basis of another array of
         * selections. So i go through each element with array.Filter - it it returns true or not depends on the result
         * of the nested array.Some which looks for any occurance in the other array.
         */
        filterMPs: function(lookingfor) {
            let all = MODEL.getArray("all");
            let filtered = all.filter((mp) => {
                return lookingfor.some((party) => {
                    return party === mp.party;
                });
            });
            CONTROLLER.storeArray(filtered, "filtered");
        }
    };
})();

const CONTROLLER = (function() {
    return {
        init: function() {
            VIEW.toggleLoadScreen();
            MODEL.initMPObject();
        },

        storeArray: function(mps, type) {
            MODEL.setArray(mps, type);
            CONTROLLER.launchPrintToplist(type);
        },

        launchPrintToplist: function(type) {
            let toPrint = MODEL.getArray(type);
            if (toPrint.length === 0) console.log("control says: Array came back empty from storage")
            else console.log("To print:", toPrint);
            VIEW.printTopList(toPrint);
        },

        navClick: function() {
            let clicked = this.firstChild.nodeValue;
            if (clicked == "Topplistan") CONTROLLER.launchPrintToplist("all");
            if (clicked == "Om") VIEW.printAbout();
            if (clicked == "Partitoppen") VIEW.printPartySummary();
            if (clicked == "Könsfördelning") VIEW.printGenderSummary();
        },

        partySelection: function(elems) {
            let selection = [];
            elems.forEach((element) => {
                if (element.classList.contains("activeParty")) {
                    selection.push(element.firstChild.nodeValue);
                }
            });
            MODEL.filterMPs(selection);
        },
        /**
         * Opens modal window for each MP. Sudden jQuery-syntax is advised from Bootstrap documentation.
         */
        openModal: function(event, mp) {
            VIEW.renderModal.call(mp);
            $("#mpModal").modal();
        }
    };
})();


const VIEW = (function() {

            /**
             * It was a nightmare to figure out how to append event listerners to all the toplist items. I tried every possible closure to get
             * not only the last one to stick. Turns out the problem was probably the DOM selector operating in the same 
             * loop as the template literal? Don't know why really. But soon as i made another loop everything just worked :/
             * @param {array} mps 
             */
            function listenersForToplist(mps) {
                for (let i in mps) {
                    document.querySelector(`tr[data-id="${mps[i].id}"]`).
                    addEventListener('click', CONTROLLER.openModal.bind(null, event, mps[i]));
                }
            }

            /**
             * You can often remove a lot of things in these topic descriptions. For ex "svar på interpellation 1235 om..." after the "om" follows
             * the real issue, so i extract everything after the "om", capitalize the first letter and return.
             * @param {string} string - topic of the speech
             */
            function trimString(string) {
                let newString = string;
                let search = newString.indexOf(" om ");
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

            function speechSnippet() {
                let string = ``;
                let count = 0;
                const sp = this.speeches;
                const eMega = `<i class="em em-mega pull-right"> </i>`;
                const eSpeech = `<i class="em em-speech_balloon pull-right"> </i>`;

                if (!sp) return `<i class="em em-disappointed"></i>`;

                for (let i in sp) {
                    //if the previous debate was the same as this one, then skip it.
                    //the loose compare is important since it accepts "0".
                    if (i == 0 || sp[i].avsnittsrubrik !== sp[i - 1].avsnittsrubrik) {
                        //byt till anforande_url_xml om tid finns
                        string += `<li><a href="${sp[i].protokoll_url_www}" target="_blank">${sp[i].replik == "Y" ? 
                        `<span class="comeback-debate debate-topic">` : `<span class="own-debate debate-topic">`}${trimString(sp[i].avsnittsrubrik)} 
                        </span></a>
                        <span class="debate-context">${capitalizeFirst(sp[i].kammaraktivitet) || "" } ${sp[i].dok_datum}.</span> 
                        `;
                        count++;
                //If the next topic will be a new one, close the list item.
                if (i > sp.length -1 && sp[i].avsnittsrubrik !== sp[i + 1].avsnittsrubrik) string += `</li>`;
            
            //instead print out an emoji
            } else string += `<span class="additional-entries">${sp[i].replik == "Y" ? eSpeech : eMega}`;
            
            if (count === 10) break;
            
        }
        return string;
    }


    return {

        toggleLoadScreen: function () {
            const loadScreen = document.querySelector(".loading");
            loadScreen.classList.toggle("visible");
            loadScreen.classList.toggle("hidden");
        },

        printTopList: function (mps) {
            //console.log(mps);
            const toplist = document.getElementById("toplist");
            let max = 10;
            const toplistArr = [];
            toplist.innerHTML = "";
            if (mps.length === 0) {
                toplist.innerHTML = `<p>Oops, det finns ingen data att visa</p>`;
                return;
            }
            //keep printing the toplist until you reach the end or the max.
            for (let i = 0; i < max && i < mps.length; i++) {
                toplist.innerHTML += `
            <tr data-id="${mps[i].id}">
                <td>${i + 1}</td>
                <td>
                    <div class="mp-img-container border-${mps[i].party}">
                        <img src="${mps[i].image}" class="mp-img" alt="${mps[i].firstname} ${mps[i].lastname}">
                    </div>
                </td>
                <td>${mps[i].firstname} ${mps[i].lastname} (${mps[i].party})</td>
                <td>${mps[i].numberofspeeches} debattinlägg</td>
            </tr>
            `;
                toplistArr.push(mps[i]);
            }
            listenersForToplist(toplistArr);
        },
        printAbout: function () {
            alert("om");
        },

        printPartySummary: function () {
            alert("partisummering");
        },

        printGenderSummary: function () {
            alert("könsfördelning");
        },

        renderModal: function () {
            //getting the dynamic content from another funcion
            let speechList = speechSnippet.call(this);
            let modalBody = document.querySelector(".modal-content");
            //setting the more static content as variables..
            let headerContent = `${this.firstname} ${this.lastname} (${this.party})`;
            let lastLine = this.speeches ? 
                `<br>Här är några av de senaste frågorna ${this.gender == "man" ? "han" : "hon"} har talat om:</p>` :
                `<br>Därför finns det inget att visa här.</p>`;
            let bodyFacts = `
            <p>Född: ${this.born}. Valkrets: ${this.electorate}.</p>
            <p>${this.firstname} har debatterat i Riksdagen vid ${this.numberofspeeches} tillfällen sedan ${MODEL.oneMonthBack()}. 
            ${lastLine}
            `;
            //..inserting them in the modal template literal.
            modalBody.innerHTML =
            `
            <div class="modal-header">
                <h5 class="modal-title" id="mpModalLabel">
                ${headerContent}
                </h5>
                <button type="button" class="close" data-dismiss="modal" aria-label="Close">
                    <span aria-hidden="true">&times;</span>
                </button>
            </div>
            <div class="modal-body">
                ${bodyFacts}
                <hr>
                <ul>
                ${speechList}
                </ul>
                <hr>
                <span class="own-debate debate-topic">     </span> = Eget anförande
                <span class="comeback-debate debate-topic">     </span> = Replik på någon annan <br>
                <i class="em em-mega"></i><i class="em em-speech_balloon"></i> = ${this.firstname} har flera inlägg i den här debatten.
            </div>
            `;
        },

        /**
         * EVENT LISTENERS FOR NON-DYNAMIC ELEMENTS
         * 1) first call picks upp mp-array and makes 300 ajax calls and creates
         * a live object.
         * 2) second call is a dev bypass that cuts directly to sorting using 
         * a readymade array of objects.
         */
        init: (function () {
            //1)
            //document.getElementById("getButton").addEventListener("click", CONTROLLER.init);
            //2
            document.getElementById("getButton").addEventListener("click", function () {
                CONTROLLER.storeArray(testMPs, "all");
            });

/**
 * event listeners for my menu items, since nothing on the page is a hyperlink, just JS.
 * Sends all of the nav-element to a controller function which then decides which one was clicked via 'this'.
 */
            document.querySelectorAll(".launch-nav-event").forEach(function (element) {
                element.addEventListener("click", CONTROLLER.navClick);
            }, this);

/**
 * Same concept with my listeners for party filtering, except I toggle a class and lets the controller function check
 * which ones are 'active', ie selected.
 */
            const partyBtns = document.querySelectorAll(".partyBtn");
            partyBtns.forEach(function (element) {
                element.addEventListener("click", function() {
                    this.classList.toggle("activeParty");
                    CONTROLLER.partySelection(partyBtns);
                });
            }, this);

        })()
    };
})();


/**
 * FOO FOR CALC ALL SPEECHES
 */
// function totalNumberOfSpeeches(array) {
//     const totalSpeeches = array.reduce(function(prev, cur) {
//         return prev + cur.numberofspeeches;
//     }, 0);
// }