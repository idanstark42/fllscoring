describe('ng-scores',function() {
    "use strict";
    var ngServices = factory('services/ng-services');
    var module = factory('services/ng-scores',{
        'services/ng-services': ngServices,
        'services/log': logMock
    });

    var $scores;
    var $stages;
    var $teams;
    var $q;
    var dummyTeam =  {
        number: 123,
        name: 'foo'
    };
    var rawMockStage = { id: "test", rounds: 3, name: "Test stage" };
    var rawMockScore = {
        file: 'somescore.json',
        teamNumber: 123,
        stageId: "test",
        round: 1,
        score: 150,
        originalScore: 150,
        published: false,
        edited: undefined,
        table: undefined
    };
    var mockStage;
    var mockScore;
    var mockTeam;
    var fsMock;
    var independenceMock;

    beforeEach(function() {
        fsMock = createFsMock({
            "scores.json": { version: 2, scores: [rawMockScore], sheets: [] },
            "stages.json": [rawMockStage],
            "teams.json": [dummyTeam]
        });
        independenceMock = createIndependenceMock();

        angular.mock.module(module.name);
        angular.mock.module(function($provide) {
            $provide.value('$fs', fsMock);
            $provide.value('$message', createMessageMock());
            $provide.value('$independence', independenceMock);
        });
        angular.mock.inject(["$scores", "$stages", "$teams", "$q", function(_$scores_, _$stages_, _$teams_,_$q_) {
            $scores = _$scores_;
            $stages = _$stages_;
            $teams = _$teams_;
            $q = _$q_;
        }]);

        return $stages.init().then(function() {
            mockStage = $stages.get(rawMockStage.id);
            return $teams.init();
        }).then(function() {
            mockTeam = $teams.get(dummyTeam.number);
            mockScore = {
                file: 'somescore.json',
                team: mockTeam,
                stage: mockStage,
                round: 1,
                score: 150,
                originalScore: 150
            };
            return $scores.init();
        });
    });

    // Strip autogenerated properties to (hopefully ;)) arrive at the same
    // object as what was used as input to $scores.add().
    function filteredScores() {
        return $scores.scores.map(function(score) {
            return {
                file: score.file,
                team: score.team,
                stage: score.stage,
                round: score.round,
                score: score.score,
                originalScore: score.originalScore
            };
        });
    }

    describe('load',function() {
        it('shuold read scores.json', function() {
            $scores.load().then(function() {
                expect(fsMock.read).toHaveBeenCalledWith('scores.json');
            });
        });
    });

    describe('clear',function() {
        it('should clear the scores',function() {
            expect(filteredScores()).toEqual([mockScore]);
            $scores.clear();
            expect(filteredScores()).toEqual([]);
        });
    });

    describe('create',function() {
        it('should call independence act',function() {
            $scores.create(mockScore).then(function() {
                expect(independenceMock.act).toHaveBeenCalled();
                expect(independenceMock.act.calls.mostRecent().args[0]).toBe('scores');
                expect(independenceMock.act.calls.mostRecent().args[1]).toBe('/scores/create');
            });
        });
    });

    describe('delete',function() {
        it('should call independence act',function() {
            var id = '1df9';
            $scores.delete({ id: id }).then(function() {
                expect(independenceMock.act).toHaveBeenCalled();
                expect(independenceMock.act.calls.mostRecent().args[0]).toBe('scores');
                expect(independenceMock.act.calls.mostRecent().args[1]).toBe(`/scores/delete/${id}`);
            });
        });
    });

    describe('update',function() {
        it('should call independence act',function() {
            var id = '1df9';
            $scores.update({ id: id }).then(function() {
                expect(independenceMock.act).toHaveBeenCalled();
                expect(independenceMock.act.calls.mostRecent().args[0]).toBe('scores');
                expect(independenceMock.act.calls.mostRecent().args[1]).toBe(`/scores/update/${id}`);
            });
        });
    });

    describe('scoreboard', function() {
        var board;

        beforeEach(function() {
            board = $scores.scoreboard;
        });

        function fillScores(input, allowErrors) {
            $scores.beginupdate();
            $scores.clear();
            input.map(function(score) {
                $scores._addRawScore(score);
             });
            $scores.endupdate();
            if (!allowErrors) {
                $scores.scores.forEach(function(score) {
                    expect(score.error).toBeFalsy();
                });
            }
        }
        var team1 = { number: 1, name: "Fleppie 1" };
        var team2 = { number: 2, name: "Fleppie 2" };
        var team3 = { number: 3, name: "Fleppie 3" };
        var team4 = { number: 4, name: "Fleppie 4" };

        beforeEach(function() {
            $teams.clear();
            $teams.add(team1);
            $teams.add(team2);
            $teams.add(team3);
            $teams.add(team4);
        });

        it('should output used stages', function() {
            fillScores([]);
            expect(Object.keys(board)).toEqual(["test"]);
        });

        it('should fill in all rounds for a team', function() {
            // If a team has played at all (i.e., they have a score for that stage)
            // then all other rounds for that team need to have an entry (which can
            // be null).
            fillScores([
                { team: team1, stage: mockStage, round: 2, score: 10 }
            ]);
            expect(board["test"][0].scores).toEqual([null, 10, null]);
        });

        it('should rank number > dnc > dsq > null', function() {
            fillScores([
                { team: team1, stage: mockStage, round: 1, score: 'dsq' },
                { team: team2, stage: mockStage, round: 1, score: 'dnc' },
                { team: team3, stage: mockStage, round: 1, score: -1 },
                { team: team4, stage: mockStage, round: 1, score: 1 },
            ]);
            var result = board["test"].map(function(entry) {
                return {
                    rank: entry.rank,
                    teamNumber: entry.team.number,
                    highest: entry.highest
                };
            });
            expect(result).toEqual([
                { rank: 1, teamNumber: team4.number, highest: 1 },
                { rank: 2, teamNumber: team3.number, highest: -1 },
                { rank: 3, teamNumber: team2.number, highest: 'dnc' },
                { rank: 4, teamNumber: team1.number, highest: 'dsq' },
            ]);

        });

        it("should assign equal rank to equal scores", function() {
            fillScores([
                { team: team1, stage: mockStage, round: 1, score: 10 },
                { team: team1, stage: mockStage, round: 2, score: 20 },
                { team: team1, stage: mockStage, round: 3, score: 30 },
                { team: team2, stage: mockStage, round: 1, score: 30 },
                { team: team2, stage: mockStage, round: 2, score: 10 },
                { team: team2, stage: mockStage, round: 3, score: 20 },
                { team: team3, stage: mockStage, round: 1, score: 30 },
                { team: team3, stage: mockStage, round: 2, score: 0 },
                { team: team3, stage: mockStage, round: 3, score: 20 },
            ]);
            var result = board["test"].map(function(entry) {
                return {
                    rank: entry.rank,
                    teamNumber: entry.team.number,
                    highest: entry.highest
                };
            });
            // Note: for equal ranks, teams are sorted according
            // to (ascending) team id
            expect(result).toEqual([
                { rank: 1, teamNumber: team1.number, highest: 30 },
                { rank: 1, teamNumber: team2.number, highest: 30 },
                { rank: 2, teamNumber: team3.number, highest: 30 },
            ]);
        });

        it("should allow filtering rounds", function() {
            fillScores([
                { team: team1, stage: mockStage, round: 1, score: 10 },
                { team: team1, stage: mockStage, round: 2, score: 20 },
                { team: team1, stage: mockStage, round: 3, score: 30 },
                { team: team2, stage: mockStage, round: 1, score: 30 },
                { team: team2, stage: mockStage, round: 2, score: 10 },
                { team: team2, stage: mockStage, round: 3, score: 20 },
                { team: team3, stage: mockStage, round: 1, score: 30 },
                { team: team3, stage: mockStage, round: 2, score: 0 },
                { team: team3, stage: mockStage, round: 3, score: 20 },
            ]);
            var filtered = $scores.getRankings({
                "test": 2
            });
            var result = filtered.scoreboard["test"].map(function(entry) {
                return {
                    rank: entry.rank,
                    teamNumber: entry.team.number,
                    scores: entry.scores
                };
            });
            // Note: for equal ranks, teams are sorted according
            // to (ascending) team id
            expect(result).toEqual([
                { rank: 1, teamNumber: team2.number, scores: [30, 10] },
                { rank: 2, teamNumber: team3.number, scores: [30, 0] },
                { rank: 3, teamNumber: team1.number, scores: [10, 20] },
            ]);
        });

        it("should ignore but warn about scores for unknown rounds / stages", function() {
            fillScores([
                { team: team1, stage: { id: "foo" }, round: 1, score: 0 },
                { team: team1, stage: mockStage, round: 0, score: 0 },
                { team: team1, stage: mockStage, round: 4, score: 0 },
            ], true);
            expect($scores.scores[0].error).toEqual(jasmine.any($scores.UnknownStageError));
            expect($scores.scores[1].error).toEqual(jasmine.any($scores.UnknownRoundError));
            expect($scores.scores[2].error).toEqual(jasmine.any($scores.UnknownRoundError));
            expect(board["test"].length).toEqual(0);
            expect($scores.validationErrors.length).toEqual(3);
        });

        it("should ignore but warn about invalid score", function() {
            fillScores([
                { team: team1, stage: mockStage, round: 1, score: "foo" },
                { team: team1, stage: mockStage, round: 2, score: NaN },
                { team: team1, stage: mockStage, round: 3, score: Infinity },
                { team: team2, stage: mockStage, round: 1, score: {} },
                { team: team2, stage: mockStage, round: 2, score: true },
            ], true);
            $scores.scores.forEach(function(score) {
                expect(score.error).toEqual(jasmine.any($scores.InvalidScoreError));
            });
            expect(board["test"].length).toEqual(0);
            expect($scores.validationErrors.length).toEqual(5);
        });

        it("should ignore but warn about duplicate score", function() {
            fillScores([
                { team: team1, stage: mockStage, round: 1, score: 10 },
                { team: team1, stage: mockStage, round: 1, score: 20 },
            ], true);
            expect($scores.scores[1].error).toEqual(jasmine.any($scores.DuplicateScoreError));
            expect(board["test"][0].highest).toEqual(10);
            expect($scores.validationErrors.length).toBeGreaterThan(0);
        });

        it("should ignore but warn about invalid team", function() {
            $teams.remove(team1.number);
            fillScores([
                { team: team1, stage: mockStage, round: 1, score: 10 },
            ], true);
            expect($scores.scores[0].error).toEqual(jasmine.any($scores.UnknownTeamError));
            expect($scores.validationErrors.length).toEqual(1);
        });
     });

});
