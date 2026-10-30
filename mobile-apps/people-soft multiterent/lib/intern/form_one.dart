import 'dart:convert';
import 'package:dropdown_button2/dropdown_button2.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hrmappfrontend/port.dart';
import 'package:hrmappfrontend/auth_client.dart' as http;
import 'package:hrmappfrontend/success_dialog.dart';
import 'package:hrmappfrontend/utils/pdf_downloader.dart';
import 'package:url_launcher/url_launcher.dart';

class FormOne extends StatefulWidget {
  final String? companyCode;
  final String? companyName;
  final String? walkinDriveId;
  final bool isSeasonal;
  final String? seasonalTitle;
  final String? role;
  final Map<String, dynamic>? assessment;
  final Map<String, dynamic>? campusStudent;

  const FormOne({
    super.key,
    this.companyCode,
    this.companyName,
    this.walkinDriveId,
    this.isSeasonal = false,
    this.seasonalTitle,
    this.role,
    this.assessment,
    this.campusStudent,
  });

  @override
  State<FormOne> createState() => _FormOneState();
}

class _FormOneState extends State<FormOne> {
  final _formKey = GlobalKey<FormState>();

  bool get isCampusStudent => widget.campusStudent != null;

  bool isVerifying = false;
  bool isVerified = false;
  bool isSubmitting = false;
  String? verifiedCompanyName;

  // Controllers
  final TextEditingController companyCodeController = TextEditingController();
  final TextEditingController fullNameController = TextEditingController();
  final TextEditingController emailController = TextEditingController();
  final TextEditingController contactController = TextEditingController();
  final TextEditingController dobController = TextEditingController();
  final TextEditingController locationController = TextEditingController();
  final TextEditingController emergencyNameController = TextEditingController();
  final TextEditingController emergencyController = TextEditingController();
  final TextEditingController otherRoleController = TextEditingController();

  // Education
  final TextEditingController degreeController = TextEditingController();
  final TextEditingController collegeController = TextEditingController();
  final TextEditingController departmentController = TextEditingController();
  final TextEditingController linkedinController = TextEditingController();

  // Experience Profile (Full-Time Attributes for Campus Students)
  bool isFresher = true;
  String experienceStatus = 'fresher';
  final TextEditingController gradYearController = TextEditingController(
    text: '2024',
  );
  final TextEditingController cgpaController = TextEditingController();
  final TextEditingController currentCompanyController =
      TextEditingController();
  final TextEditingController currentDesignationController =
      TextEditingController();
  final TextEditingController yearsExpController = TextEditingController();
  final TextEditingController noticePeriodController = TextEditingController();
  final TextEditingController currentCtcController = TextEditingController();
  final TextEditingController expectedCtcController = TextEditingController();
  final TextEditingController joinDateController = TextEditingController();

  String selectedApplicationType = "Internship";
  String? selectedGender;
  final List<String> genders = ['Male', 'Female', 'Other'];

  String? selectedMaritalStatus;
  final List<String> maritalOptions = ['Single', 'Married'];

  String? selectedYear = '1st Year';
  final List<String> years = [
    '1st Year',
    '2nd Year',
    '3rd Year',
    '4th Year',
    '5th Year',
    'Passed Out',
  ];

  String? selectedRole;
  List<String> roles = ['Other'];

  PlatformFile? resumeFile;
  final List<TextEditingController> projectLinkControllers = [
    TextEditingController(),
  ];

  // Dynamic Assessment
  List<dynamic> _careerPostings = [];
  Map<String, dynamic>? _assessment;
  List<dynamic> _assessmentQuestions = [];
  final Map<String, dynamic> _assessmentAnswers = {};
  final Map<String, List<String>> _assessmentTags = {};
  final Map<String, String> _assessmentOtherText = {};
  final Map<String, List<TextEditingController>> _assessmentLinkCtrls = {};
  final Map<String, TextEditingController> _assessmentTextCtrls = {};

  // Declarations
  bool declareAccuracy = false;
  bool consentBackground = false;
  bool agreeCommunication = false;

  bool isTimelineExpired = false;
  String? timelineExpiredMessage;

  final String baseUrl = getBaseUrl();

  // Animated background orbs
  final double _orb1Top = 100;
  final double _orb1Left = -50;
  final double _orb2Top = 500;
  final double _orb2Left = 200;

  @override
  void initState() {
    super.initState();

    if (widget.campusStudent != null) {
      final cs = widget.campusStudent!;
      if (cs['isFormSubmitted'] == true || cs['isOnboarded'] == true) {
        isTimelineExpired = true;
        timelineExpiredMessage =
            "You have already submitted your application for this campus drive. Multiple submissions are not allowed.";
      }

      final driveEndStr = cs['driveEndDate']?.toString();
      if (driveEndStr != null && driveEndStr.isNotEmpty) {
        final end = DateTime.tryParse(driveEndStr);
        if (end != null) {
          final endOfDay = end.hour == 0 && end.minute == 0 && end.second == 0
              ? DateTime(end.year, end.month, end.day, 23, 59, 59, 999)
              : end;
          if (DateTime.now().isAfter(endOfDay)) {
            isTimelineExpired = true;
            timelineExpiredMessage =
                "The registration timeline for this campus drive has ended. Form submission is closed.";
          }
        }
      }

      fullNameController.text = cs['fullName'] ?? '';
      emailController.text = cs['email'] ?? '';
      contactController.text = cs['phone'] ?? '';
      collegeController.text = cs['collegeName'] ?? '';
      degreeController.text = cs['degree'] ?? '';
      departmentController.text = cs['department'] ?? '';
      if (cs['dob'] != null && cs['dob'].toString().isNotEmpty) {
        final rawDob = cs['dob'].toString().split('T')[0];
        if (rawDob.contains('-')) {
          final parts = rawDob.split('-');
          if (parts.length == 3 && parts[0].length == 4) {
            dobController.text =
                '${parts[2].padLeft(2, '0')}/${parts[1].padLeft(2, '0')}/${parts[0]}';
          } else {
            dobController.text = rawDob;
          }
        } else {
          dobController.text = rawDob;
        }
      } else {
        dobController.text = '';
      }
      if (cs['cgpa'] != null) {
        cgpaController.text = cs['cgpa'].toString();
      }

      final candidateRoles = List<String>.from(
        cs['appliedRoles'] ?? [],
      ).where((r) => r.trim().isNotEmpty).toSet().toList();
      if (candidateRoles.isNotEmpty) {
        roles = candidateRoles;
        selectedRole = candidateRoles.first;
      }
    }

    final initialCode =
        (widget.companyCode != null && widget.companyCode!.isNotEmpty)
        ? widget.companyCode!
        : 'SOFTRATE';
    companyCodeController.text = initialCode;
    isVerified = true;
    verifiedCompanyName = widget.companyName ?? 'Softrate Technologies';

    if (widget.isSeasonal) {
      selectedRole = null;
    } else if (widget.role != null &&
        widget.role!.isNotEmpty &&
        widget.role!.trim().toLowerCase() != 'test') {
      selectedRole = widget.role;
      if (!roles.contains(widget.role)) roles.insert(0, widget.role!);
    }

    if (companyCodeController.text.trim().isNotEmpty &&
        widget.campusStudent == null) {
      _verifyCompany();
    }

    if (widget.assessment != null) {
      _initAssessment(widget.assessment!);
    }
  }

  @override
  void dispose() {
    companyCodeController.dispose();
    fullNameController.dispose();
    emailController.dispose();
    contactController.dispose();
    dobController.dispose();
    locationController.dispose();
    emergencyNameController.dispose();
    emergencyController.dispose();
    otherRoleController.dispose();
    degreeController.dispose();
    collegeController.dispose();
    departmentController.dispose();
    linkedinController.dispose();
    gradYearController.dispose();
    cgpaController.dispose();
    currentCompanyController.dispose();
    currentDesignationController.dispose();
    yearsExpController.dispose();
    noticePeriodController.dispose();
    currentCtcController.dispose();
    expectedCtcController.dispose();
    joinDateController.dispose();
    for (var c in projectLinkControllers) {
      c.dispose();
    }
    for (var list in _assessmentLinkCtrls.values) {
      for (var c in list) {
        c.dispose();
      }
    }
    for (var c in _assessmentTextCtrls.values) {
      c.dispose();
    }
    super.dispose();
  }

  void _clearAssessment() {
    for (var list in _assessmentLinkCtrls.values) {
      for (var c in list) {
        c.dispose();
      }
    }
    _assessmentLinkCtrls.clear();
    for (var c in _assessmentTextCtrls.values) {
      c.dispose();
    }
    _assessmentTextCtrls.clear();
    _assessmentAnswers.clear();
    _assessmentTags.clear();
    _assessmentOtherText.clear();
    _assessmentQuestions = [];
    _assessment = null;
  }

  void _initAssessment(Map<String, dynamic> assessment) {
    _clearAssessment();
    setState(() {
      _assessment = assessment;
      _assessmentQuestions = assessment['questions'] as List? ?? [];
      for (var q in _assessmentQuestions) {
        final id = (q['id'] ?? '').toString();
        final type = (q['type'] ?? '').toString();
        if (type == 'multiselect') {
          _assessmentTags[id] = [];
        } else if (type == 'links') {
          final minLinks = q['minLinks'] is int ? q['minLinks'] as int : 1;
          _assessmentLinkCtrls[id] = List.generate(
            minLinks > 0 ? minLinks : 1,
            (_) => TextEditingController(),
          );
        } else if (type == 'text' || type == 'textarea') {
          _assessmentTextCtrls[id] = TextEditingController();
        } else {
          _assessmentAnswers[id] = null;
        }
      }
    });
  }

  void _updateAssessmentForRole(String? roleName) {
    if (roleName == null || roleName.isEmpty) return;
    final target = roleName.toLowerCase().trim();
    dynamic matchedAssessment;
    for (var p in _careerPostings) {
      if ((p['title'] ?? '').toString().toLowerCase().trim() == target) {
        if (p['assessment'] != null && p['assessment']['enabled'] != false) {
          matchedAssessment = p['assessment'];
        }
        break;
      }
    }
    if (matchedAssessment != null) {
      _initAssessment(Map<String, dynamic>.from(matchedAssessment));
    } else if (widget.assessment == null) {
      setState(() {
        _clearAssessment();
      });
    }
  }

  Future<void> _pickDob() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime(now.year - 20),
      firstDate: DateTime(1950),
      lastDate: now,
    );

    if (picked != null) {
      final formatted =
          '${picked.day.toString().padLeft(2, '0')}/${picked.month.toString().padLeft(2, '0')}/${picked.year}';
      setState(() {
        dobController.text = formatted;
      });
    }
  }

  Future<void> _pickResume() async {
    try {
      final result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'doc', 'docx'],
        withData: true,
      );

      if (result != null) {
        final file = result.files.first;

        if (file.size > 2 * 1024 * 1024) {
          if (!mounted) return;
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text("File size must be less than 2MB"),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }

        setState(() {
          resumeFile = file;
        });
      }
    } catch (e) {
      debugPrint("File picking error: $e");
    }
  }

  bool _isGitLink(String url) {
    if (url.isEmpty) return false;
    final lower = url.toLowerCase().trim();
    return lower.contains('github.com') ||
        lower.contains('gitlab.com') ||
        lower.contains('bitbucket.org') ||
        lower.endsWith('.git');
  }

  Future<void> _verifyCompany() async {
    final code = companyCodeController.text.trim();
    if (code.isEmpty) return;

    setState(() {
      isVerifying = true;
      isVerified = false;
      verifiedCompanyName = null;
    });

    try {
      final response = await http.get(
        Uri.parse('$baseUrl/api/onboarding/verify/$code'),
      );

      if (response.statusCode == 200) {
        final data = jsonDecode(response.body);
        if (!mounted) return;
        setState(() {
          isVerified = true;
          verifiedCompanyName =
              data['company']?['name'] ??
              widget.companyName ??
              'Softrate Technologies';

          try {
            if (widget.campusStudent == null &&
                data['company'] != null &&
                data['company']['settings'] != null &&
                data['company']['settings']['internRoles'] != null) {
              final List<dynamic> fetchedRoles =
                  data['company']['settings']['internRoles'];
              if (fetchedRoles.isNotEmpty) {
                roles = fetchedRoles.map((e) {
                  return e
                      .toString()
                      .split(' ')
                      .map((word) {
                        if (word.isEmpty) return word;
                        return word[0].toUpperCase() +
                            word.substring(1).toLowerCase();
                      })
                      .join(' ');
                }).toList();

                final sTitle = (widget.seasonalTitle ?? '')
                    .trim()
                    .toLowerCase();
                roles.removeWhere((r) {
                  final lower = r.trim().toLowerCase();
                  return lower == 'test' ||
                      (sTitle.isNotEmpty && lower == sTitle) ||
                      lower == 'other';
                });

                if (!roles.contains('Other')) roles.add('Other');

                if (widget.isSeasonal) {
                  selectedRole = roles.firstWhere(
                    (r) => r != 'Other',
                    orElse: () => roles.first,
                  );
                } else if (widget.role != null &&
                    widget.role!.isNotEmpty &&
                    widget.role!.trim().toLowerCase() != 'test') {
                  if (widget.role!.trim().toLowerCase() != sTitle) {
                    if (!roles.contains(widget.role)) {
                      roles.insert(0, widget.role!);
                    }
                    selectedRole = widget.role;
                  } else {
                    selectedRole = roles.firstWhere(
                      (r) => r != 'Other',
                      orElse: () => roles.first,
                    );
                  }
                } else {
                  selectedRole ??= roles.firstWhere(
                    (r) => r != 'Other',
                    orElse: () => roles.first,
                  );
                }
              }
            }

            if (data['company']?['settings']?['careerPostings'] is List) {
              _careerPostings =
                  data['company']['settings']['careerPostings'] as List;
              _updateAssessmentForRole(selectedRole ?? widget.role);
            }
          } catch (e) {
            debugPrint("Error parsing roles: $e");
          }
        });
      } else {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Invalid company code"),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      debugPrint("Verify error: $e");
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Error verifying company. Check connection."),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => isVerifying = false);
    }
  }

  Future<void> submitForm() async {
    FocusManager.instance.primaryFocus?.unfocus();

    if (isTimelineExpired) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(
            timelineExpiredMessage ??
                "The registration timeline for this campus drive has ended. Submissions are closed.",
          ),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (!_formKey.currentState!.validate()) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please fill all required fields correctly"),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    if (!widget.isSeasonal && resumeFile == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please upload your Resume / CV"),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    // Validate dynamic assessment questions (skip for seasonal internship)
    if (!widget.isSeasonal) {
      for (var q in _assessmentQuestions) {
        final id = (q['id'] ?? '').toString();
        final label = (q['label'] ?? id).toString();
        final isRequired = q['required'] == true;
        final type = (q['type'] ?? '').toString();
        if (isRequired) {
          if (type == 'multiselect') {
            if ((_assessmentTags[id] ?? []).isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Please answer: $label'),
                  backgroundColor: Colors.red,
                ),
              );
              return;
            }
          } else if (type == 'links') {
            final links = (_assessmentLinkCtrls[id] ?? [])
                .map((c) => c.text.trim())
                .where((l) => l.isNotEmpty)
                .toList();
            final minLinks = q['minLinks'] is int ? q['minLinks'] as int : 1;
            if (links.length < minLinks) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text(
                    'Please provide at least $minLinks live project link(s) for: $label',
                  ),
                  backgroundColor: Colors.red,
                ),
              );
              return;
            }
            for (var l in links) {
              if (_isGitLink(l)) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                    content: Text(
                      'Git repository links (GitHub/GitLab) are not accepted. Please provide live deployed URLs.',
                    ),
                    backgroundColor: Colors.red,
                  ),
                );
                return;
              }
            }
          } else if (type == 'text' || type == 'textarea') {
            if ((_assessmentTextCtrls[id]?.text.trim() ?? '').isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Please answer: $label'),
                  backgroundColor: Colors.red,
                ),
              );
              return;
            }
          } else {
            if ((_assessmentAnswers[id] ?? '').toString().trim().isEmpty) {
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(
                  content: Text('Please select an option for: $label'),
                  backgroundColor: Colors.red,
                ),
              );
              return;
            }
          }
        }
      }
    }

    if (isCampusStudent) {
      final validProjects = projectLinkControllers
          .map((c) => c.text.trim())
          .where((l) => l.isNotEmpty)
          .toList();
      if (validProjects.isEmpty) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Please provide at least one live project link."),
            backgroundColor: Colors.red,
          ),
        );
        return;
      }
      for (var l in validProjects) {
        if (_isGitLink(l)) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text(
                "Git repository links (GitHub/GitLab) are not accepted. Please provide live deployed URLs.",
              ),
              backgroundColor: Colors.red,
            ),
          );
          return;
        }
      }
    }

    if (!declareAccuracy || !consentBackground || !agreeCommunication) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text("Please accept all declarations to proceed"),
          backgroundColor: Colors.red,
        ),
      );
      return;
    }

    final String finalRole = selectedRole == 'Other'
        ? otherRoleController.text.trim()
        : (selectedRole ?? widget.role ?? 'Intern');

    String? resumeBase64;
    if (resumeFile != null && resumeFile!.bytes != null) {
      resumeBase64 = base64Encode(resumeFile!.bytes!);
    }

    // Compile Assessment Answers
    final Map<String, dynamic> assessmentData = {};
    if (_assessmentQuestions.isNotEmpty) {
      for (var q in _assessmentQuestions) {
        final id = (q['id'] ?? '').toString();
        final label = (q['label'] ?? id).toString();
        final type = (q['type'] ?? '').toString();
        if (type == 'multiselect') {
          final tags = List<String>.from(_assessmentTags[id] ?? []);
          if (tags.contains('Other') &&
              (_assessmentOtherText[id]?.isNotEmpty ?? false)) {
            final oIdx = tags.indexOf('Other');
            tags[oIdx] = 'Other: ${_assessmentOtherText[id]}';
          }
          assessmentData[label] = tags.join(', ');
        } else if (type == 'links') {
          final vLinks = (_assessmentLinkCtrls[id] ?? [])
              .map((c) => c.text.trim())
              .where((l) => l.isNotEmpty)
              .toList();
          assessmentData[label] = vLinks;
        } else if (type == 'text' || type == 'textarea') {
          assessmentData[label] = _assessmentTextCtrls[id]?.text.trim() ?? '';
        } else {
          assessmentData[label] = _assessmentAnswers[id] ?? '';
        }
      }
    }

    final Map<String, dynamic> body = {
      "companyCode": companyCodeController.text.trim().toUpperCase(),
      "fullName": fullNameController.text.trim(),
      "email": emailController.text.trim(),
      "contact": contactController.text.trim(),
      "phone": contactController.text.trim(),
      "dob": () {
        final dStr = dobController.text.trim();
        if (dStr.contains('/')) {
          final p = dStr.split('/');
          if (p.length == 3) {
            return '${p[2]}-${p[1].padLeft(2, '0')}-${p[0].padLeft(2, '0')}';
          }
        }
        return dStr;
      }(),
      "gender": selectedGender ?? '',
      "location": locationController.text.trim(),
      "maritalStatus": selectedMaritalStatus ?? 'Single',
      "degree": degreeController.text.trim(),
      "qualification": degreeController.text.trim(),
      "college": collegeController.text.trim(),
      "year": (selectedYear != null && selectedYear!.trim().isNotEmpty)
          ? selectedYear!.trim()
          : (gradYearController.text.trim().isNotEmpty
                ? gradYearController.text.trim()
                : '1st Year'),
      "department": departmentController.text.trim(),
      "role": finalRole,
      "emergencyContact": emergencyController.text.trim().isNotEmpty
          ? emergencyController.text.trim()
          : contactController.text.trim(),
      "emergencyContactName": emergencyNameController.text.trim().isNotEmpty
          ? emergencyNameController.text.trim()
          : fullNameController.text.trim(),
      "linkedin": linkedinController.text.trim(),
      "applicationType": selectedApplicationType,
      "resume": resumeBase64,
      "assessmentAnswers": jsonEncode(assessmentData),
      "projectLinks": jsonEncode(() {
        if (isCampusStudent) {
          return projectLinkControllers
              .map((c) => c.text.trim())
              .where((l) => l.isNotEmpty)
              .toList();
        }
        final List<String> aLinks = [];
        for (var q in _assessmentQuestions) {
          if ((q['type'] ?? '') == 'links') {
            final qId = (q['id'] ?? '').toString();
            aLinks.addAll(
              (_assessmentLinkCtrls[qId] ?? [])
                  .map((c) => c.text.trim())
                  .where((l) => l.isNotEmpty),
            );
          }
        }
        return aLinks.isNotEmpty
            ? aLinks
            : projectLinkControllers
                  .map((c) => c.text.trim())
                  .where((l) => l.isNotEmpty)
                  .toList();
      }()),
    };

    final isDrive = widget.walkinDriveId != null;
    final isWalkin = isDrive && !widget.isSeasonal;
    if (isDrive) {
      body['walkinDriveId'] = widget.walkinDriveId!;
    }

    if (widget.campusStudent?['id'] != null ||
        widget.campusStudent?['_id'] != null) {
      body['campusStudentId'] =
          widget.campusStudent?['id'] ?? widget.campusStudent?['_id'];
    }

    if (isCampusStudent) {
      body['isExperienced'] = !isFresher;
      body['experienceStatus'] = isFresher ? 'fresher' : 'experienced';
      body['passingYear'] = gradYearController.text.trim();
      body['cgpaOrPercentage'] = cgpaController.text.trim();

      if (!isFresher) {
        body['previousOrg'] = currentCompanyController.text.trim();
        body['designation'] = currentDesignationController.text.trim();
        body['experienceYears'] = yearsExpController.text.trim();
        body['currentCtc'] = currentCtcController.text.trim();
        body['expectedCtc'] = expectedCtcController.text.trim();
        body['noticePeriod'] = noticePeriodController.text.trim();
        body['joiningDate'] = joinDateController.text.trim();
      }
    }

    final url = isCampusStudent
        ? Uri.parse('$baseUrl/api/campus-hiring/public/student-submit')
        : (isDrive
              ? Uri.parse('$baseUrl/api/public/walkin-apply')
              : Uri.parse('$baseUrl/api/intern/add'));

    setState(() => isSubmitting = true);

    try {
      final response = await http.post(
        url,
        headers: {"Content-Type": "application/json"},
        body: jsonEncode(body),
      );

      if (response.statusCode == 200) {
        fullNameController.clear();
        degreeController.clear();
        collegeController.clear();
        departmentController.clear();
        otherRoleController.clear();
        emailController.clear();
        contactController.clear();
        dobController.clear();
        locationController.clear();
        emergencyController.clear();
        emergencyNameController.clear();
        linkedinController.clear();
        setState(() {
          selectedYear = null;
          selectedGender = null;
          selectedMaritalStatus = null;
          resumeFile = null;
          declareAccuracy = false;
          consentBackground = false;
          agreeCommunication = false;
        });

        if (isWalkin) {
          final responseData = jsonDecode(response.body);
          final whatsappLink = responseData['whatsappGroupLink'] ?? '';
          final jdPdfUrl = responseData['jdPdfUrl'] ?? '';

          if (!mounted) return;
          showDialog(
            context: context,
            barrierDismissible: false,
            barrierColor: Colors.black.withValues(alpha: 0.3),
            builder: (_) => Dialog(
              elevation: 0,
              backgroundColor: Colors.transparent,
              child: Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(24),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: 0.15),
                      blurRadius: 20,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.green.shade50,
                        shape: BoxShape.circle,
                      ),
                      child: const Icon(
                        Icons.check_circle_rounded,
                        color: Colors.green,
                        size: 48,
                      ),
                    ),
                    const SizedBox(height: 16),
                    const Text(
                      "Application Submitted!",
                      style: TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.bold,
                        color: Color(0xFF0F172A),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Text(
                      "Thank you for registering for the Walk-in Drive at $verifiedCompanyName.",
                      textAlign: TextAlign.center,
                      style: TextStyle(
                        fontSize: 14,
                        color: Colors.grey.shade600,
                        height: 1.4,
                      ),
                    ),
                    const SizedBox(height: 20),
                    if (jdPdfUrl.isNotEmpty)
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: OutlinedButton.icon(
                          onPressed: () {
                            final fullUrl = jdPdfUrl.startsWith('http')
                                ? jdPdfUrl
                                : '$baseUrl$jdPdfUrl';
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                content: Text("Downloading Job Description..."),
                                duration: Duration(seconds: 2),
                              ),
                            );
                            PdfDownloader.downloadPdf(
                              fullUrl,
                              "JobDescription.pdf",
                            );
                          },
                          icon: const Icon(
                            Icons.download,
                            color: Color(0xFF00657F),
                          ),
                          label: const Text(
                            "Download Job Description",
                            style: TextStyle(
                              color: Color(0xFF00657F),
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                            ),
                          ),
                          style: OutlinedButton.styleFrom(
                            side: const BorderSide(
                              color: Color(0xFF00657F),
                              width: 1.5,
                            ),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    if (jdPdfUrl.isNotEmpty) const SizedBox(height: 12),
                    if (whatsappLink.isNotEmpty)
                      SizedBox(
                        width: double.infinity,
                        height: 48,
                        child: ElevatedButton.icon(
                          onPressed: () async {
                            final uri = Uri.tryParse(whatsappLink);
                            if (uri != null) {
                              await launchUrl(
                                uri,
                                mode: LaunchMode.externalApplication,
                              );
                            }
                          },
                          icon: const Icon(
                            Icons.chat,
                            color: Colors.white,
                            size: 20,
                          ),
                          label: const Text(
                            "Join WhatsApp Group",
                            style: TextStyle(
                              fontSize: 15,
                              fontWeight: FontWeight.bold,
                              color: Colors.white,
                            ),
                          ),
                          style: ElevatedButton.styleFrom(
                            backgroundColor: const Color(0xFF00657F),
                            elevation: 0,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                        ),
                      ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 48,
                      child: TextButton(
                        onPressed: () => Navigator.pop(context),
                        child: const Text(
                          "Close",
                          style: TextStyle(
                            fontSize: 15,
                            color: Colors.grey,
                            fontWeight: FontWeight.bold,
                          ),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          );
        } else {
          if (!mounted) return;
          showSuccessPopup(
            context,
            isCampusStudent
                ? "Campus details registered successfully! Your profile has been updated for this campus hiring drive."
                : "Your application is submitted and thank you for applying!",
          );
        }
      } else {
        final data = jsonDecode(response.body);
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(
              data['message'] ?? 'An error occurred. Please try again.',
            ),
            backgroundColor: Colors.red,
          ),
        );
      }
    } catch (e) {
      debugPrint('Submission error: $e');
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text("Something went wrong"),
            backgroundColor: Colors.red,
          ),
        );
      }
    } finally {
      if (mounted) setState(() => isSubmitting = false);
    }
  }

  // ------------- UI HELPERS -------------

  Widget _buildBackgroundOrb(
    double left,
    double top,
    double size,
    Color color,
  ) {
    return Positioned(
      left: left,
      top: top,
      child: Container(
        width: size,
        height: size,
        decoration: BoxDecoration(shape: BoxShape.circle, color: color),
      ),
    );
  }

  Widget sectionHeader(
    String title, {
    IconData icon = Icons.info_outline,
    bool isFirst = false,
  }) {
    return Padding(
      padding: EdgeInsets.only(top: isFirst ? 8 : 32, bottom: 18),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!isFirst) ...[
            const Divider(color: Color(0xFFE2E8F0), thickness: 1, height: 1),
            const SizedBox(height: 24),
          ],
          Row(
            children: [
              Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(icon, size: 18, color: const Color(0xFF008C9E)),
              ),
              const SizedBox(width: 10),
              Text(
                title,
                style: const TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: Color(0xFF0F172A),
                  letterSpacing: -0.2,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  InputDecoration _fieldDecoration(String? label) {
    return InputDecoration(
      labelText: (label != null && label.isNotEmpty) ? label : null,
      labelStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.normal,
        color: Color(0xFF64748B),
      ),
      floatingLabelStyle: const TextStyle(
        fontSize: 13,
        fontWeight: FontWeight.normal,
        color: Color(0xFF008C9E),
      ),
      hintStyle: const TextStyle(
        fontSize: 14,
        fontWeight: FontWeight.normal,
        color: Color(0xFF94A3B8),
      ),
      floatingLabelBehavior: FloatingLabelBehavior.auto,
      filled: true,
      fillColor: const Color(0xFFF8FAFC),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: BorderSide.none,
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFE2E8F0)),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFF008C9E), width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.2),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(14),
        borderSide: const BorderSide(color: Color(0xFFEF4444), width: 1.5),
      ),
    );
  }

  Widget inputField(
    String label,
    TextEditingController controller, {
    TextInputType type = TextInputType.text,
    String? hint,
    String? Function(String?)? validator,
    int maxLines = 1,
    bool enabled = true,
    List<TextInputFormatter>? inputFormatters,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: TextFormField(
        controller: controller,
        keyboardType: type,
        maxLines: maxLines,
        enabled: enabled,
        inputFormatters: inputFormatters,
        validator:
            validator ??
            (val) => val == null || val.trim().isEmpty
                ? 'This field is required'
                : null,
        decoration: _fieldDecoration(label).copyWith(hintText: hint),
      ),
    );
  }

  DropdownStyleData _buildDropdownStyleData({double maxHeight = 280}) {
    return DropdownStyleData(
      maxHeight: maxHeight,
      elevation: 6,
      offset: const Offset(0, -4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x1A000000),
            blurRadius: 18,
            offset: Offset(0, 8),
          ),
        ],
      ),
      scrollbarTheme: ScrollbarThemeData(
        radius: const Radius.circular(8),
        thickness: WidgetStateProperty.all(4),
        thumbColor: WidgetStateProperty.all(const Color(0xFF94A3B8)),
      ),
    );
  }

  MenuItemStyleData _buildMenuItemStyleData() {
    return const MenuItemStyleData(
      height: 46,
      padding: EdgeInsets.symmetric(horizontal: 14),
    );
  }

  IconStyleData _buildIconStyleData() {
    return const IconStyleData(
      icon: Icon(Icons.keyboard_arrow_down_rounded, color: Color(0xFF64748B)),
      iconSize: 22,
    );
  }

  Widget dropdownField(
    String label,
    String? value,
    List<String> options,
    Function(String?) onChanged, {
    Key? key,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 20),
      child: Theme(
        data: Theme.of(context).copyWith(
          canvasColor: Colors.white,
          colorScheme: Theme.of(context).colorScheme.copyWith(
            surface: Colors.white,
            surfaceContainer: Colors.white,
            surfaceContainerHigh: Colors.white,
          ),
        ),
        child: DropdownButtonFormField2<String>(
          key: key,
          isExpanded: true,
          value: (value != null && options.contains(value))
              ? value
              : (options.isNotEmpty ? options.first : null),
          items: options
              .map(
                (e) => DropdownMenuItem(
                  value: e,
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          e,
                          style: TextStyle(
                            fontSize: 14,
                            color: e == value
                                ? const Color(0xFF008C9E)
                                : const Color(0xFF1E293B),
                            fontWeight: e == value
                                ? FontWeight.w600
                                : FontWeight.normal,
                          ),
                        ),
                      ),
                      if (e == value)
                        const Icon(
                          Icons.check_rounded,
                          size: 18,
                          color: Color(0xFF008C9E),
                        ),
                    ],
                  ),
                ),
              )
              .toList(),
          onChanged: onChanged,
          decoration: _fieldDecoration(label),
          validator: (val) => val == null ? 'This field is required' : null,
          selectedItemBuilder: (context) => options
              .map(
                (e) => Text(
                  e,
                  style: const TextStyle(
                    fontWeight: FontWeight.normal,
                    fontSize: 14,
                  ),
                ),
              )
              .toList(),
          iconStyleData: _buildIconStyleData(),
          dropdownStyleData: _buildDropdownStyleData(),
          menuItemStyleData: _buildMenuItemStyleData(),
        ),
      ),
    );
  }

  Widget _buildResumeUploadCard() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Resume / CV *",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 8),
          InkWell(
            onTap: _pickResume,
            borderRadius: BorderRadius.circular(14),
            child: Container(
              height: 54,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: resumeFile != null
                    ? const Color(0xFF00657F).withValues(alpha: 0.05)
                    : const Color(0xFFF7F9FC),
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: resumeFile != null
                      ? const Color(0xFF00657F)
                      : const Color(0xFFE1E6F0),
                  width: 1.5,
                ),
              ),
              child: Row(
                children: [
                  Icon(
                    resumeFile != null
                        ? Icons.check_circle_rounded
                        : Icons.upload_file_rounded,
                    color: resumeFile != null
                        ? const Color(0xFF00657F)
                        : Colors.grey.shade500,
                    size: 22,
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          resumeFile != null
                              ? resumeFile!.name
                              : "Upload Resume (Max 2MB)",
                          style: TextStyle(
                            color: resumeFile != null
                                ? const Color(0xFF003648)
                                : Colors.grey.shade600,
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                          ),
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (resumeFile != null)
                          Text(
                            "${(resumeFile!.size / 1024).toStringAsFixed(1)} KB",
                            style: TextStyle(
                              color: Colors.grey.shade500,
                              fontSize: 11,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (resumeFile != null)
                    GestureDetector(
                      onTap: () => setState(() => resumeFile = null),
                      child: const Icon(
                        Icons.close_rounded,
                        color: Colors.redAccent,
                        size: 18,
                      ),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildProjectLinksSection() {
    return Padding(
      padding: const EdgeInsets.only(bottom: 22),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Project Links (Live Deployed URLs) *",
            style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w600,
              color: Color(0xFF1E293B),
            ),
          ),
          Container(
            margin: const EdgeInsets.only(top: 4, bottom: 12),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
            decoration: BoxDecoration(
              color: const Color(0xFFF8FAFC),
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: const Color(0xFFE2E8F0)),
            ),
            child: const Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: EdgeInsets.only(top: 1.5),
                  child: Icon(Icons.info_outline, size: 14, color: Color(0xFF64748B)),
                ),
                SizedBox(width: 8),
                Expanded(
                  child: Text(
                    "Provide live deployed project URLs (e.g. Vercel, Netlify, Render, Portfolio). Git repository links (GitHub/GitLab) are not allowed.",
                    style: TextStyle(
                      fontSize: 12,
                      color: Color(0xFF475569),
                      fontWeight: FontWeight.w400,
                      height: 1.35,
                    ),
                  ),
                ),
              ],
            ),
          ),
          ...projectLinkControllers.asMap().entries.map((entry) {
            final index = entry.key;
            return Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Row(
                children: [
                  Expanded(
                    child: TextFormField(
                      controller: projectLinkControllers[index],
                      keyboardType: TextInputType.url,
                      autovalidateMode: AutovalidateMode.onUserInteraction,
                      validator: (val) {
                        final trimmed = val?.trim() ?? '';
                        if (index == 0 && trimmed.isEmpty) {
                          return 'At least one live project link is required';
                        }
                        if (trimmed.isNotEmpty) {
                          if (_isGitLink(trimmed)) {
                            return 'Git links not allowed. Provide live deployed URL.';
                          }
                          final uri = Uri.tryParse(trimmed);
                          if (uri == null || !uri.hasScheme || !uri.hasAuthority) {
                            return 'Enter a valid URL (e.g. https://myproject.vercel.app)';
                          }
                        }
                        return null;
                      },
                      decoration: _fieldDecoration("Project ${index + 1} URL *")
                          .copyWith(
                            hintText: "https://project-${index + 1}.vercel.app",
                            prefixIcon: const Icon(
                              Icons.link,
                              size: 18,
                              color: Color(0xFF008C9E),
                            ),
                          ),
                    ),
                  ),
                  if (projectLinkControllers.length > 1)
                    IconButton(
                      onPressed: () {
                        setState(() {
                          projectLinkControllers[index].dispose();
                          projectLinkControllers.removeAt(index);
                        });
                      },
                      icon: const Icon(
                        Icons.remove_circle_outline,
                        color: Colors.redAccent,
                      ),
                    ),
                ],
              ),
            );
          }),
          if (projectLinkControllers.length < 5)
            Padding(
              padding: const EdgeInsets.only(top: 4),
              child: TextButton.icon(
                onPressed: () {
                  setState(() {
                    projectLinkControllers.add(TextEditingController());
                  });
                },
                icon: const Icon(
                  Icons.add_circle_outline,
                  color: Color(0xFF008C9E),
                ),
                label: const Text(
                  "Add another project",
                  style: TextStyle(
                    color: Color(0xFF008C9E),
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildAssessmentSection() {
    return Container(
      padding: const EdgeInsets.all(18),
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (_assessment?['description'] != null &&
              _assessment!['description'].toString().trim().isNotEmpty) ...[
            Text(
              _assessment!['description'].toString().trim(),
              style: const TextStyle(
                fontSize: 13,
                color: Color(0xFF64748B),
                height: 1.4,
              ),
            ),
            const SizedBox(height: 16),
          ],
          ..._assessmentQuestions.map((q) => _buildAssessmentQuestionItem(q)),
        ],
      ),
    );
  }

  Widget _buildAssessmentQuestionItem(dynamic q) {
    final id = (q['id'] ?? '').toString();
    final label = (q['label'] ?? id).toString();
    final type = (q['type'] ?? '').toString();
    final isRequired = q['required'] == true;
    final List<String> options = (q['options'] is List)
        ? (q['options'] as List).map((e) => e.toString()).toList()
        : (type == 'rating'
              ? ['Beginner', 'Basic', 'Good', 'Very Good', 'Expert']
              : []);

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            '$label${isRequired ? ' *' : ''}',
            style: const TextStyle(
              fontWeight: FontWeight.w600,
              fontSize: 13,
              color: Color(0xFF1E293B),
            ),
          ),
          const SizedBox(height: 6),
          if (type == 'dropdown' || type == 'rating') ...[
            Theme(
              data: Theme.of(context).copyWith(
                canvasColor: Colors.white,
                colorScheme: Theme.of(context).colorScheme.copyWith(
                  surface: Colors.white,
                  surfaceContainer: Colors.white,
                  surfaceContainerHigh: Colors.white,
                ),
              ),
              child: DropdownButtonFormField2<String>(
                isExpanded: true,
                value: _assessmentAnswers[id],
                hint: Text(
                  q['placeholder'] ?? 'Select an option',
                  style: TextStyle(fontSize: 13, color: Colors.grey[500]),
                ),
                items: options.map((opt) {
                  final isSelected = _assessmentAnswers[id] == opt;
                  return DropdownMenuItem<String>(
                    value: opt,
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            opt,
                            style: TextStyle(
                              fontSize: 13,
                              color: isSelected
                                  ? const Color(0xFF008C9E)
                                  : const Color(0xFF1E293B),
                              fontWeight: isSelected
                                  ? FontWeight.w600
                                  : FontWeight.normal,
                            ),
                          ),
                        ),
                        if (isSelected)
                          const Icon(
                            Icons.check_rounded,
                            size: 18,
                            color: Color(0xFF008C9E),
                          ),
                      ],
                    ),
                  );
                }).toList(),
                onChanged: (val) {
                  setState(() {
                    _assessmentAnswers[id] = val;
                  });
                },
                decoration: _fieldDecoration(null),
                iconStyleData: _buildIconStyleData(),
                dropdownStyleData: _buildDropdownStyleData(),
                menuItemStyleData: _buildMenuItemStyleData(),
              ),
            ),
          ] else if (type == 'text') ...[
            TextFormField(
              controller: _assessmentTextCtrls[id],
              decoration: _fieldDecoration(
                q['placeholder'] ?? 'Enter your response',
              ),
            ),
          ] else if (type == 'textarea') ...[
            TextFormField(
              controller: _assessmentTextCtrls[id],
              maxLines: 3,
              decoration: _fieldDecoration(
                q['placeholder'] ?? 'Write your response here...',
              ),
            ),
          ] else if (type == 'multiselect') ...[
            Theme(
              data: Theme.of(context).copyWith(
                canvasColor: Colors.white,
                colorScheme: Theme.of(context).colorScheme.copyWith(
                  surface: Colors.white,
                  surfaceContainer: Colors.white,
                  surfaceContainerHigh: Colors.white,
                ),
              ),
              child: DropdownButtonFormField2<String>(
                isExpanded: true,
                hint: Text(
                  q['placeholder'] ?? 'Select options',
                  style: TextStyle(fontSize: 13, color: Colors.grey[500]),
                ),
                items: options.map((opt) {
                  final isSelected = (_assessmentTags[id] ?? []).contains(opt);
                  return DropdownMenuItem<String>(
                    value: opt,
                    child: Container(
                      decoration: BoxDecoration(
                        color: isSelected
                            ? const Color(0xFFF0FDFA)
                            : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 8,
                        vertical: 6,
                      ),
                      child: Row(
                        children: [
                          Icon(
                            isSelected
                                ? Icons.check_box_rounded
                                : Icons.check_box_outline_blank_rounded,
                            size: 18,
                            color: isSelected
                                ? const Color(0xFF008C9E)
                                : const Color(0xFF94A3B8),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              opt,
                              style: TextStyle(
                                fontSize: 13,
                                color: isSelected
                                    ? const Color(0xFF008C9E)
                                    : const Color(0xFF1E293B),
                                fontWeight: isSelected
                                    ? FontWeight.w600
                                    : FontWeight.normal,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ),
                  );
                }).toList(),
                onChanged: (val) {
                  if (val != null) {
                    setState(() {
                      _assessmentTags.putIfAbsent(id, () => []);
                      if (_assessmentTags[id]!.contains(val)) {
                        _assessmentTags[id]!.remove(val);
                      } else {
                        _assessmentTags[id]!.add(val);
                      }
                    });
                  }
                },
                decoration: _fieldDecoration(null),
                iconStyleData: _buildIconStyleData(),
                dropdownStyleData: _buildDropdownStyleData(),
                menuItemStyleData: _buildMenuItemStyleData(),
              ),
            ),
            if ((_assessmentTags[id] ?? []).isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 6,
                runSpacing: 6,
                children: _assessmentTags[id]!.map((tag) {
                  return Chip(
                    label: Text(
                      tag,
                      style: const TextStyle(
                        fontSize: 11,
                        color: Color(0xFF008C9E),
                      ),
                    ),
                    backgroundColor: const Color(0xFFE0F4F7),
                    deleteIcon: const Icon(
                      Icons.close,
                      size: 14,
                      color: Color(0xFF008C9E),
                    ),
                    onDeleted: () {
                      setState(() {
                        _assessmentTags[id]!.remove(tag);
                        if (tag == 'Other') {
                          _assessmentOtherText[id] = '';
                        }
                      });
                    },
                  );
                }).toList(),
              ),
            ],
            if ((_assessmentTags[id] ?? []).contains('Other')) ...[
              const SizedBox(height: 8),
              TextFormField(
                initialValue: _assessmentOtherText[id],
                onChanged: (val) => _assessmentOtherText[id] = val,
                decoration: _fieldDecoration('Please specify other details...'),
              ),
            ],
          ] else if (type == 'links') ...[
            Container(
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
              decoration: BoxDecoration(
                color: const Color(0xFFF8FAFC),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: const Color(0xFFE2E8F0)),
              ),
              child: const Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: 1),
                    child: Icon(Icons.info_outline, size: 13, color: Color(0xFF64748B)),
                  ),
                  SizedBox(width: 6),
                  Expanded(
                    child: Text(
                      "Provide live deployed project URLs. Git repository links (GitHub/GitLab) are not accepted.",
                      style: TextStyle(
                        fontSize: 11.5,
                        color: Color(0xFF475569),
                        fontWeight: FontWeight.w400,
                        height: 1.3,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            ...List.generate((_assessmentLinkCtrls[id] ?? []).length, (lIdx) {
              final ctrl = _assessmentLinkCtrls[id]![lIdx];
              return Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: TextFormField(
                        controller: ctrl,
                        decoration: _fieldDecoration(
                          'https://project-${lIdx + 1}.vercel.app',
                        ),
                        autovalidateMode: AutovalidateMode.onUserInteraction,
                        validator: (val) {
                          if (val != null &&
                              val.trim().isNotEmpty &&
                              _isGitLink(val)) {
                            return 'Git links not allowed. Provide live deployed URL.';
                          }
                          return null;
                        },
                      ),
                    ),
                    if ((_assessmentLinkCtrls[id] ?? []).length >
                        (q['minLinks'] is int ? q['minLinks'] as int : 1))
                      IconButton(
                        icon: const Icon(
                          Icons.remove_circle_outline,
                          color: Colors.red,
                          size: 20,
                        ),
                        onPressed: () {
                          setState(() {
                            ctrl.dispose();
                            _assessmentLinkCtrls[id]!.removeAt(lIdx);
                          });
                        },
                      ),
                  ],
                ),
              );
            }),
            if ((_assessmentLinkCtrls[id] ?? []).length <
                (q['maxLinks'] is int ? q['maxLinks'] as int : 5))
              TextButton.icon(
                onPressed: () {
                  setState(() {
                    _assessmentLinkCtrls[id]!.add(TextEditingController());
                  });
                },
                icon: const Icon(Icons.add, size: 16, color: Color(0xFF008C9E)),
                label: const Text(
                  'Add Link',
                  style: TextStyle(fontSize: 12, color: Color(0xFF008C9E)),
                ),
              ),
          ],
        ],
      ),
    );
  }

  Widget declarationsSection() {
    return Container(
      margin: const EdgeInsets.only(top: 4, bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 8),
      decoration: BoxDecoration(
        color: const Color(0xFFF8FAFC),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: const Color(0xFFE2E8F0)),
      ),
      child: Column(
        children: [
          CheckboxListTile(
            dense: false,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF008C9E),
            title: const Text(
              "I declare information is accurate",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1E293B),
              ),
            ),
            value: declareAccuracy,
            onChanged: (val) => setState(() => declareAccuracy = val ?? false),
          ),
          const Divider(
            color: Color(0xFFEEF2F6),
            height: 1,
            indent: 8,
            endIndent: 8,
          ),
          CheckboxListTile(
            dense: false,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF008C9E),
            title: const Text(
              "I Consent for background verification",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1E293B),
              ),
            ),
            value: consentBackground,
            onChanged: (val) =>
                setState(() => consentBackground = val ?? false),
          ),
          const Divider(
            color: Color(0xFFEEF2F6),
            height: 1,
            indent: 8,
            endIndent: 8,
          ),
          CheckboxListTile(
            dense: false,
            contentPadding: const EdgeInsets.symmetric(
              horizontal: 8,
              vertical: 2,
            ),
            controlAffinity: ListTileControlAffinity.leading,
            activeColor: const Color(0xFF008C9E),
            title: const Text(
              "Agree to receive communication via WhatsApp and Mail",
              style: TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w500,
                color: Color(0xFF1E293B),
              ),
            ),
            value: agreeCommunication,
            onChanged: (val) =>
                setState(() => agreeCommunication = val ?? false),
          ),
        ],
      ),
    );
  }

  // ------------- MAIN BUILD -------------

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.of(context).size;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: Container(
        width: size.width,
        height: size.height,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFFFA726), Color(0xFF8ED1DC), Color(0xFF00657F)],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
        ),
        child: Stack(
          children: [
            _buildBackgroundOrb(
              size.width * 0.8,
              size.height * 0.1,
              300,
              const Color(0xFF8ED1DC).withValues(alpha: 0.3),
            ),
            _buildBackgroundOrb(
              _orb1Left,
              _orb1Top,
              250,
              const Color(0xFFFFA726).withValues(alpha: 0.2),
            ),
            _buildBackgroundOrb(
              _orb2Left,
              _orb2Top,
              350,
              const Color(0xFF00657F).withValues(alpha: 0.15),
            ),

            TweenAnimationBuilder<double>(
              duration: const Duration(milliseconds: 1200),
              tween: Tween(begin: 1.0, end: 0.0),
              curve: Curves.easeOutQuart,
              builder: (context, value, child) {
                return Transform.translate(
                  offset: Offset(0, 60 * value),
                  child: Opacity(opacity: 1.0 - value, child: child),
                );
              },
              child: SingleChildScrollView(
                child: Column(
                  children: [
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.fromLTRB(16, 60, 16, 20),
                      decoration: const BoxDecoration(
                        color: Colors.transparent,
                      ),
                      child: Container(
                        padding: const EdgeInsets.all(22),
                        decoration: BoxDecoration(
                          gradient: const LinearGradient(
                            colors: [Color(0xFF00657F), Color(0xFF003648)],
                            begin: Alignment.topLeft,
                            end: Alignment.bottomRight,
                          ),
                          borderRadius: BorderRadius.circular(24),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.3),
                              blurRadius: 15,
                              offset: const Offset(0, 10),
                            ),
                            BoxShadow(
                              color: const Color(
                                0xFF8ED1DC,
                              ).withValues(alpha: 0.1),
                              blurRadius: 1,
                              spreadRadius: 1,
                            ),
                          ],
                          border: Border.all(
                            color: const Color(
                              0xFF8ED1DC,
                            ).withValues(alpha: 0.2),
                            width: 0.8,
                          ),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              mainAxisAlignment: MainAxisAlignment.spaceBetween,
                              children: [
                                Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    const Text(
                                      "Welcome to",
                                      style: TextStyle(
                                        color: Color(0xFF8ED1DC),
                                        fontSize: 14,
                                        fontWeight: FontWeight.w600,
                                        letterSpacing: 1.5,
                                      ),
                                    ),
                                    const Text(
                                      "Softrate Global",
                                      style: TextStyle(
                                        color: Colors.white,
                                        fontWeight: FontWeight.w900,
                                        fontSize: 28,
                                        height: 1.1,
                                      ),
                                    ),
                                  ],
                                ),
                              ],
                            ),
                            const SizedBox(height: 12),
                            Container(
                              width: 45,
                              height: 4,
                              decoration: BoxDecoration(
                                color: const Color(0xFFFFA726),
                                borderRadius: BorderRadius.circular(2),
                              ),
                            ),
                            const SizedBox(height: 16),
                            Text(
                              "Apply For An Internship And Get Your Profile Reviewed By Our HR Team.",
                              style: TextStyle(
                                color: Colors.white.withValues(alpha: 0.8),
                                fontSize: 13,
                                height: 1.5,
                                fontWeight: FontWeight.w400,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      width: double.infinity,
                      constraints: BoxConstraints(minHeight: size.height * 0.7),
                      padding: const EdgeInsets.fromLTRB(20, 28, 20, 40),
                      decoration: const BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.all(Radius.circular(28)),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black12,
                            blurRadius: 10,
                            offset: Offset(0, -5),
                          ),
                        ],
                      ),
                      child: _buildForm(context),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  // ------------- FORM CONTENT -------------

  Widget _buildForm(BuildContext context) {
    return Form(
      key: _formKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text(
            "Fill your details",
            style: TextStyle(
              fontSize: 18,
              fontWeight: FontWeight.w700,
              color: Color(0xFF0F172A),
              letterSpacing: -0.3,
            ),
          ),
          const SizedBox(height: 4),
          const Text(
            "Complete the required fields below to submit your application.",
            style: TextStyle(
              fontSize: 13,
              color: Color(0xFF64748B),
              fontWeight: FontWeight.w400,
            ),
          ),
          const SizedBox(height: 14),

          if (isTimelineExpired)
            Container(
              margin: const EdgeInsets.only(bottom: 16),
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFEF2F2),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFFECACA)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.error_outline, color: Color(0xFFDC2626)),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      timelineExpiredMessage ??
                          "The registration timeline for this campus drive has ended. Submissions are closed.",
                      style: const TextStyle(
                        color: Color(0xFF991B1B),
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

          // Only display company code input/verification banner if company code was not already determined/verified
          if (widget.companyCode == null &&
              companyCodeController.text.trim().toUpperCase() !=
                  'SOFTRATE') ...[
            if (!isVerified)
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(
                    child: inputField(
                      "Company Code *",
                      companyCodeController,
                      enabled: !isVerified,
                    ),
                  ),
                  const SizedBox(width: 8),
                  Padding(
                    padding: const EdgeInsets.only(top: 6),
                    child: SizedBox(
                      height: 52,
                      child: ElevatedButton(
                        onPressed: (isVerifying || isVerified)
                            ? null
                            : _verifyCompany,
                        style: ElevatedButton.styleFrom(
                          backgroundColor: isVerified
                              ? Colors.green
                              : const Color(0xFF008C9E),
                          foregroundColor: Colors.white,
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(12),
                          ),
                        ),
                        child: isVerifying
                            ? const SizedBox(
                                width: 18,
                                height: 18,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  valueColor: AlwaysStoppedAnimation<Color>(
                                    Colors.white,
                                  ),
                                ),
                              )
                            : Icon(isVerified ? Icons.check : Icons.search),
                      ),
                    ),
                  ),
                ],
              ),

            if (isVerified && verifiedCompanyName != null)
              Padding(
                padding: const EdgeInsets.only(top: 4, bottom: 16),
                child: Row(
                  children: [
                    const Icon(
                      Icons.verified_rounded,
                      color: Color(0xFF10B981),
                      size: 16,
                    ),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text.rich(
                        TextSpan(
                          children: [
                            TextSpan(
                              text: "Applying to: ",
                              style: TextStyle(
                                color: Colors.grey.shade600,
                                fontSize: 13,
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            TextSpan(
                              text: verifiedCompanyName,
                              style: const TextStyle(
                                color: Color(0xFF0F172A),
                                fontSize: 13,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                    if (widget.companyCode == null)
                      TextButton(
                        onPressed: () => setState(() => isVerified = false),
                        style: TextButton.styleFrom(
                          padding: EdgeInsets.zero,
                          minimumSize: Size.zero,
                          tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                        ),
                        child: const Text(
                          "Change",
                          style: TextStyle(color: Colors.grey, fontSize: 12),
                        ),
                      ),
                  ],
                ),
              ),
          ],

          Opacity(
            opacity: isVerified ? 1.0 : 0.5,
            child: IgnorePointer(
              ignoring: !isVerified,
              child: Column(
                children: [
                  if (widget.isSeasonal)
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(top: 4, bottom: 12),
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 12,
                      ),
                      decoration: BoxDecoration(
                        color: const Color(0xFFF1F5F9),
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: const Color(0xFFE2E8F0)),
                      ),
                      child: Text(
                        "Applying for ${widget.seasonalTitle ?? 'Seasonal Internship'}",
                        style: const TextStyle(
                          fontSize: 13,
                          color: Color(0xFF334155),
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),

                  // SECTION 1 – Personal Details
                  sectionHeader(
                    "Personal details",
                    icon: Icons.person_outline,
                    isFirst: true,
                  ),
                  inputField(
                    "Full Name *",
                    fullNameController,
                    hint: "Enter your full name",
                    enabled: !isCampusStudent,
                  ),
                  if (!(isCampusStudent && contactController.text.trim().isNotEmpty))
                    inputField(
                      "Phone Number (WhatsApp) *",
                      contactController,
                      type: TextInputType.phone,
                      hint: "10-digit number",
                      enabled: !isCampusStudent,
                      inputFormatters: [
                        FilteringTextInputFormatter.digitsOnly,
                        LengthLimitingTextInputFormatter(10),
                      ],
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'This field is required';
                        }
                        if (val.trim().length != 10) {
                          return 'Enter a valid 10-digit number';
                        }
                        return null;
                      },
                    ),
                  if (!(isCampusStudent && emailController.text.trim().isNotEmpty))
                    inputField(
                      "Email Address *",
                      emailController,
                      type: TextInputType.emailAddress,
                      hint: "name@example.com",
                      enabled: !isCampusStudent,
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'This field is required';
                        }
                        final emailRegex = RegExp(
                          r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$',
                        );
                        if (!emailRegex.hasMatch(val.trim())) {
                          return 'Enter a valid email address';
                        }
                        return null;
                      },
                    ),
                  if (!(isCampusStudent && dobController.text.trim().isNotEmpty))
                    Padding(
                      padding: const EdgeInsets.only(bottom: 20),
                      child: TextFormField(
                        controller: dobController,
                        readOnly: true,
                        onTap: _pickDob,
                        validator: (val) => val == null || val.trim().isEmpty
                            ? 'This field is required'
                            : null,
                        decoration: _fieldDecoration("Date of Birth *").copyWith(
                          hintText: "DD/MM/YYYY",
                          suffixIcon: const Icon(
                            Icons.calendar_today_outlined,
                            size: 18,
                          ),
                        ),
                      ),
                    ),
                  dropdownField(
                    "Gender *",
                    selectedGender,
                    genders,
                    (val) => setState(() => selectedGender = val),
                  ),
                  inputField(
                    "Place, District *",
                    locationController,
                    hint: "e.g. Guindy, Chennai",
                  ),
                  if (!widget.isSeasonal && !isCampusStudent) ...[
                    dropdownField(
                      "Marital Status *",
                      selectedMaritalStatus,
                      maritalOptions,
                      (val) => setState(() => selectedMaritalStatus = val),
                    ),
                  ],
                  dropdownField("Role Applied For *", selectedRole, roles, (
                    val,
                  ) {
                    setState(() {
                      selectedRole = val;
                      _updateAssessmentForRole(val);
                    });
                  }),
                  if (selectedRole == 'Other')
                    inputField(
                      "Specify Role *",
                      otherRoleController,
                      validator: (val) {
                        if (val == null || val.trim().isEmpty) {
                          return 'Please specify the role';
                        }
                        return null;
                      },
                    ),

                  // SECTION 2 – Education & Profile
                  sectionHeader(
                    "Education & Profile",
                    icon: Icons.school_outlined,
                  ),
                  if (!(isCampusStudent && degreeController.text.trim().isNotEmpty))
                    inputField(
                      "Highest Degree / Qualification *",
                      degreeController,
                      hint: "e.g. B.E Computer Science, B.Tech, B.Sc, etc.",
                      enabled: !isCampusStudent,
                    ),
                  if (!(isCampusStudent && collegeController.text.trim().isNotEmpty))
                    inputField(
                      "College / University Name *",
                      collegeController,
                      hint: "Full name of your institution",
                      enabled: !isCampusStudent,
                    ),
                  dropdownField(
                    "Year of Studying *",
                    selectedYear,
                    years,
                    (val) => setState(() => selectedYear = val),
                  ),
                  if (!(isCampusStudent && departmentController.text.trim().isNotEmpty))
                    inputField(
                      "Department / Specialization *",
                      departmentController,
                      hint: "e.g. Computer Science, Information Technology",
                      enabled: !isCampusStudent,
                    ),
                  if (!widget.isSeasonal) _buildResumeUploadCard(),
                  inputField(
                    "LinkedIn Profile URL *",
                    linkedinController,
                    hint: "https://linkedin.com/in/yourprofile",
                    validator: (value) {
                      if (value == null || value.trim().isEmpty) {
                        return "LinkedIn profile is required";
                      }
                      if (!value.trim().contains("linkedin.com")) {
                        return "Enter a valid LinkedIn profile URL";
                      }
                      return null;
                    },
                  ),
                  // Project Links for Campus Drive candidates (role-specific assessment handles regular applicants)
                  if (isCampusStudent) _buildProjectLinksSection(),

                  // SECTION 3 – Dynamic Role Assessment (Skip for Seasonal Internship)
                  if (!widget.isSeasonal &&
                      _assessmentQuestions.isNotEmpty) ...[
                    sectionHeader(
                      _assessment?['title'] ?? "Role Assessment",
                      icon: Icons.quiz_outlined,
                    ),
                    _buildAssessmentSection(),
                  ],

                  // SECTION 4 – Declarations
                  sectionHeader(
                    "Declarations",
                    icon: Icons.verified_user_outlined,
                  ),
                  declarationsSection(),

                  const SizedBox(height: 32),
                  SizedBox(
                    width: double.infinity,
                    height: 52,
                    child: ElevatedButton(
                      onPressed: (isSubmitting || isTimelineExpired)
                          ? null
                          : submitForm,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: isTimelineExpired
                            ? Colors.grey
                            : const Color(0xFF008C9E),
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: isSubmitting
                          ? const SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                valueColor: AlwaysStoppedAnimation<Color>(
                                  Colors.white,
                                ),
                              ),
                            )
                          : Text(
                              isTimelineExpired
                                  ? "Registrations Closed"
                                  : "Submit Application",
                              style: const TextStyle(
                                fontSize: 16,
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
