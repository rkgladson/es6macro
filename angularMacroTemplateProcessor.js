/*globals angular, console*/
/**
 * Created by rgladson on 6/26/2015.
 * Just because the language is javascript, there is no excuse to write bad code!™
 */
(function (angular, undefined) {
  "use strict";


  var module = angular.module('crazyLikeAFox', ['ng']);
  module.factory('es6HtmlMacro', ['$parse', function ($parse) {


    function splitOnSignificantSymbols(string) {

      return string.split(
        /(['](?:\\\\|\\'|[^'])*'?|["](?:\\\\|\\"|[^"])*"?|\{)/
      ).filter(
        function (val) { return val;}
      );
    }

    function separateTemplate(string) {
      var post = [], pre = string.split(
        /(<!--|-->|(?:(?:data-|x-)?ng-)?pattern\s*=\s*(?:"[^"]*"|'[^']*'|\S*)|\$\{|\})/i
      ).filter(
        function (val) { return val;}
      ), index = 0, commentText;
      function pushToPost(value) {
        post.push(value);
      }
      function pushToComment(value) {
        commentText.push(value);
      }
      // Find all comments and combine them
      while (~(index = findFirstOf(pre, /^<!--$/, index, pushToPost))) {
        commentText = ['<!--'];
        index = findFirstOf(pre, /^-->$/, index + 1, pushToComment);
        commentText.push('-->'); // Close it for them, even if it isn't there
        post.push(commentText.join(''));
        if (~index) { // If an ending was found
          index += 1;
        } else {
          break;
        }
      }
      return post;
    }

    function findFirstOf(array, regex, start, callbackFalsely) {
      var idx, length = array.length;
      for (idx = start || 0; idx < length; idx += 1) {
        if (regex.test(array[idx])) {
          return idx;
        } else if (callbackFalsely) {
          callbackFalsely(array[idx]);
        }
      }
      return -1;
    }


    function findEndOfString(string, stringType, from) {
      var start = from || 0, end = string.length, curIdx;
      curIdx = start;
      for (start = from || 0; curIdx < end && string.charAt(curIdx) !== stringType; curIdx += 1) {
        // Don't read escaped sequences
        // This ignores the unicode cases, however they won't give us problems
        // because none of those sequences use $, } or {.
        if (string.charAt(curIdx) !== '\\') {
          curIdx += 1;
        }
      }
      return curIdx < end ? curIdx : -1;
    }



    function buildLex(string, buildLexObj) {
      var lexStream = [];
      var raw = separateTemplate(string),
        unreadIdx = 0, searchIdx, rawLength = raw.length;

      /**
       * Push a string value to the lex
       * @param value
       */
      function pushToLex(value) {
        var filteredVal = value, last = lexStream.length - 1;
        if (typeof  lexStream[last] === 'string') {
          // Join previous text with new text
          lexStream[last] += filteredVal;
        } else {
          lexStream.push(filteredVal);
        }
      }

      function handleMacroBlock(blockStart) {
        var searchIdx, blockEnd;
        var curInspection;
        var braceOpen = 1, inString = false, stringType = '', splitSection, stringEnd, lastSubStr;
        braceSearch: for (searchIdx = blockStart + 1; braceOpen && searchIdx < rawLength; searchIdx += 1) {
          curInspection = raw[searchIdx];
          if (inString) {
            // Opening and Closing braces inside of strings do not count
            // Find the end of the open string.
            stringEnd = findEndOfString(curInspection, stringType);
            if (!~stringEnd) {
              continue braceSearch;
            }
            // Break apart the currently read section.
            curInspection = curInspection.slice(stringEnd + 1);
            // We are no longer in a string.
            inString = false;
          } else if (curInspection === '}') {
            // Closing braces outside of strings count
            braceOpen -= 1;
            continue braceSearch;
          }

          // Break apart the sub-component into examinable groups
          splitSection = splitOnSignificantSymbols(curInspection);
          // Count the number of non-string braces
          braceOpen += splitSection.filter(function (val) { return val === '{'; }).length;

          lastSubStr = splitSection[splitSection.length - 1] || '';
          // Catch opened strings, as this will affect how future raw components are read.
          inString = /^(['](?:\\\\|\\'|[^'])*|["](?:\\\\|\\"|[^"])*)$/.test(lastSubStr);
          // Save the type of string, if it is a string, to determine what the open string type is in a later address
          stringType = inString ? lastSubStr.charAt(0) : undefined;
        }

        if (braceOpen === 0) { // Parse match Success
          blockEnd = searchIdx;
          // Build a Parsing Object for the instruction that was just found
          // and add it to the lexStream
          lexStream.push(buildLexObj(raw.slice(blockStart, blockEnd).join('')));
        } else {
          // Mark we were only able to find the one false positive or parsing error
          blockEnd = blockStart + 1;
          // Save it as normal text
          pushToLex(raw[blockStart]);
        }
        // Return the last unread position
        return blockEnd;
      }

      read: while (unreadIdx < rawLength) {
        // Find the next declarative block
        searchIdx = findFirstOf(raw, /^(\$\{)$/, unreadIdx, pushToLex);
        if (searchIdx === -1) {
          break read;
        }
        unreadIdx = handleMacroBlock(searchIdx) ;
      }
      return {lexStream: lexStream, raw: raw};
    }



    return function compileTemplate(template) {
      var scope = {}, instructionMap = Object.create(null);
      var macroStream = buildLex(template, buildLexObj);


      function buildLexObj(block) {
        var getter,
          // Remove the ${ and } from the block found.
          instruction = block.slice(2, -1),
          mapResult = instructionMap[instruction],
          lexObject = mapResult || {
            toString: function () {
              return this.getter(scope);
            }
          };
        if (!mapResult) {
          try {
            lexObject.getter = $parse(instruction);
            lexObject.instruction = instruction;
          } catch (e) {
            console.warn('Angular could not parse instuction "' + instruction + '". Spitting out as literal');
            lexObject.instruction = block;
            lexObject.getter = function parseError() { return this.instruction; };
          }
          // Cache our parse for future use.
          instructionMap[instruction] = lexObject;
        }
        return lexObject;
      }
      function renderTemplate(context) {
        var output;
        scope = context || {};
        output = macroStream.lexStream.join('');
        scope = {};
        return output;
      }
      // Make the internal structure visible to the outside world.
      renderTemplate.raw = macroStream.raw;
      renderTemplate.lexStream = macroStream.lexStream;
      return renderTemplate;
    };
  }]);
}(angular));

var es6HtmlMacro = angular.injector(['crazyLikeAFox']).get('es6HtmlMacro');